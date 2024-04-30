import { Bezier } from "../third-party/bezier-js.js";
import { fitCubic } from "./fit-cubic.js";
import { enumerate, modulo, range, reversed } from "./utils.js";
import {
  POINT_TYPE_OFF_CURVE_CUBIC,
  POINT_TYPE_OFF_CURVE_QUAD,
  VarPackedPath,
} from "./var-path.js";
import * as vector from "./vector.js";

export function insertPoint(path, intersection) {
  let selectedPointIndex;
  const segment = intersection.segment;
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(
    segment.parentPointIndices[0]
  );
  const numContourPoints = path.getNumPointsOfContour(contourIndex);
  const absToRel = contourPointIndex - segment.parentPointIndices[0];
  let insertIndex = segment.pointIndices.at(-1) + absToRel;
  if (segment.points.length === 2) {
    // insert point in line
    const points = segment.pointIndices.map((i) => path.getPoint(i));
    if (insertIndex <= 0) {
      insertIndex = numContourPoints;
    }
    path.insertPoint(
      contourIndex,
      insertIndex,
      vector.roundVector(vector.interpolateVectors(...points, intersection.t))
    );
    selectedPointIndex = insertIndex;
  } else {
    // insert point in curve
    const segments = [...path.iterContourDecomposedSegments(contourIndex)];
    const segment = segments[intersection.segmentIndex];
    const bezier = new Bezier(...segment.points);
    const firstOffCurve = path.getPoint(segment.parentPointIndices[1]);
    const { left, right } = bezier.split(intersection.t);
    if (firstOffCurve.type === "cubic") {
      const points = [...left.points.slice(1), ...right.points.slice(1, 3)].map(
        vector.roundVector
      );
      points[0].type = "cubic";
      points[1].type = "cubic";
      points[2].smooth = true;
      points[3].type = "cubic";
      points[4].type = "cubic";

      const deleteIndices = segment.parentPointIndices.slice(1, -1);
      if (insertIndex < deleteIndices.length) {
        insertIndex = numContourPoints;
      }
      for (const point of reversed(points)) {
        path.insertPoint(contourIndex, insertIndex, point);
      }
      // selectionBias is non-zero if the cubic segment has more than
      // two off-curve points, which is currently invalid. We delete all
      // off-curve, and replace with clean cubic segments, but this messes
      // with the selection index
      const selectionBias = segment.parentPointIndices.length - 4;
      selectedPointIndex = insertIndex - selectionBias;
      deleteIndices.sort((a, b) => b - a); // reverse sort
      deleteIndices.forEach((pointIndex) =>
        path.deletePoint(contourIndex, pointIndex + absToRel)
      );
    } else {
      // quad
      const points = [left.points[1], left.points[2], right.points[1]].map(
        vector.roundVector
      );
      points[0].type = "quad";
      points[1].smooth = true;
      points[2].type = "quad";

      const point1 = path.getPoint(segment.pointIndices[0]);
      const point2 = path.getPoint(segment.pointIndices[1]);
      const point3 = path.getPoint(segment.pointIndices[2]);
      insertIndex = segment.pointIndices[1] + absToRel;
      if (point3.type) {
        path.insertPoint(contourIndex, insertIndex + 1, impliedPoint(point2, point3));
      }
      if (point1.type) {
        path.insertPoint(contourIndex, insertIndex, impliedPoint(point1, point2));
        insertIndex++;
      }
      // Delete off-curve
      path.deletePoint(contourIndex, insertIndex);

      // Insert split
      for (const point of reversed(points)) {
        path.insertPoint(contourIndex, insertIndex, point);
      }
      selectedPointIndex = insertIndex + 1;
    }
  }
  const selection = new Set();
  if (selectedPointIndex !== undefined) {
    selectedPointIndex = path.getAbsolutePointIndex(contourIndex, selectedPointIndex);
    selection.add(`point/${selectedPointIndex}`);
  }
  return selection;
}

function impliedPoint(pointA, pointB) {
  return {
    x: Math.round((pointA.x + pointB.x) / 2),
    y: Math.round((pointA.y + pointB.y) / 2),
    smooth: true,
  };
}

export function insertHandles(path, segmentPoints, insertIndex, type = "cubic") {
  let [contourIndex, contourPointIndex] = path.getContourAndPointIndex(insertIndex);
  if (!contourPointIndex) {
    contourPointIndex = path.getNumPointsOfContour(contourIndex);
  }
  insertIndex = path.getAbsolutePointIndex(contourIndex, contourPointIndex, true);
  const handlePoints = [
    vector.interpolateVectors(...segmentPoints, 1 / 3),
    vector.interpolateVectors(...segmentPoints, 2 / 3),
  ].map((pt) => {
    return { ...vector.roundVector(pt), type: type };
  });
  path.insertPoint(contourIndex, contourPointIndex, handlePoints[1]);
  path.insertPoint(contourIndex, contourPointIndex, handlePoints[0]);
  return new Set([`point/${insertIndex}`, `point/${insertIndex + 1}`]);
}

export function filterPathByPointIndices(path, pointIndices, doCut = false) {
  const selectionByContour = getSelectionByContour(path, pointIndices);
  const filteredUnpackedContours = [];
  const remainingUnpackedContours = doCut ? new Map() : null;
  for (const [contourIndex, contourPointIndices] of selectionByContour.entries()) {
    const contour = path.getUnpackedContour(contourIndex);
    const numContourPoints = contour.points.length;
    const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
    const indexSet = makeExpandedIndexSet(
      path,
      contourPointIndices,
      contourIndex,
      startPoint
    );
    if (indexSet.size === numContourPoints) {
      // Easy: the whole contour is copied
      filteredUnpackedContours.push(contour);
      remainingUnpackedContours?.set(contourIndex, []);
      continue;
    }
    // Split
    const filteredIndices = [...indexSet];
    filteredIndices.sort((a, b) => a - b);
    const filteredRanges = splitContourPointRanges(
      filteredIndices,
      contour.isClosed,
      numContourPoints
    );
    filteredUnpackedContours.push(
      ...rangesToContours(path, startPoint, filteredRanges)
    );
    if (doCut) {
      const remainingRanges = invertContourPointRanges(
        filteredRanges,
        contour.isClosed,
        numContourPoints
      );
      remainingUnpackedContours.set(contourIndex, [
        ...rangesToContours(path, startPoint, remainingRanges),
      ]);
    }
  }
  if (doCut) {
    // replace selected contours with remainingUnpackedContours
    const remainingContourIndices = [...remainingUnpackedContours.keys()];
    // Reverse-sort the contour indices, so we can replace contours
    // with multiple split contours without invalidating the prior
    // contour indices
    remainingContourIndices.sort((a, b) => b - a);
    for (const contourIndex of remainingContourIndices) {
      path.deleteContour(contourIndex);
      for (const contour of reversed(remainingUnpackedContours.get(contourIndex))) {
        path.insertUnpackedContour(contourIndex, contour);
      }
    }
  }
  return VarPackedPath.fromUnpackedContours(filteredUnpackedContours);
}

function makeExpandedIndexSet(
  path,
  contourPointIndices,
  contourIndex,
  startPoint,
  greedy = true
) {
  // Given a "sparse" selection, fill in the gaps by adding all off-curve points
  // that are included in selected segments
  const indexSet = new Set(contourPointIndices);
  for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
    const indices = segment.pointIndices.map((i) => i - startPoint);
    const firstPointIndex = indices[0];
    const lastPointIndex = indices.at(-1);
    if (
      (greedy &&
        indices.length > 2 &&
        indices.slice(1, -1).some((i) => indexSet.has(i))) ||
      (indexSet.has(firstPointIndex) && indexSet.has(lastPointIndex))
    ) {
      indices.forEach((i) => indexSet.add(i));
    }
  }
  return indexSet;
}

export function splitPathAtPointIndices(path, pointIndices) {
  let numSplits = 0;
  const selectionByContour = getSelectionByContour(path, pointIndices);
  const selectedContours = [...selectionByContour.keys()];
  // Reverse-sort the contour indices, so we can replace contours
  // with multiple split contours without invalidating the prior
  // contour indices
  selectedContours.sort((a, b) => b - a);

  for (const contourIndex of selectedContours) {
    const contour = path.getUnpackedContour(contourIndex);
    const isClosed = path.contourInfo[contourIndex].isClosed;
    const points = contour.points;
    // Filter out off-curve points, as well as start and end points of open paths
    const contourPointIndices = selectionByContour
      .get(contourIndex)
      .filter((i) => !points[i].type && (isClosed || (i > 0 && i < points.length - 1)));
    if (!contourPointIndices.length) {
      continue;
    }
    numSplits += contourPointIndices.length;

    const pointArrays = [points];
    let pointIndexBias = 0;
    if (isClosed) {
      const splitPointIndex = contourPointIndices.pop();
      pointArrays[0] = splitClosedPointsArray(points, splitPointIndex);
      pointIndexBias = points.length - splitPointIndex;
    }

    for (const splitPointIndex of reversed(contourPointIndices)) {
      const points = pointArrays.pop();
      const [points1, points2] = splitOpenPointsArray(
        points,
        splitPointIndex + pointIndexBias
      );
      pointArrays.push(points2);
      pointArrays.push(points1);
    }

    path.deleteContour(contourIndex);
    // Insert the split contours in reverse order
    for (const points of pointArrays) {
      // Ensure the end points are not smooth
      delete points[0].smooth;
      delete points[points.length - 1].smooth;
      path.insertUnpackedContour(contourIndex, { points: points, isClosed: false });
    }
  }
  return numSplits;
}

function splitClosedPointsArray(points, splitPointIndex) {
  return points.slice(splitPointIndex).concat(points.slice(0, splitPointIndex + 1));
}

function splitOpenPointsArray(points, splitPointIndex) {
  if (!splitPointIndex || splitPointIndex >= points.length - 1) {
    throw new Error(`assert -- invalid point index ${splitPointIndex}`);
  }
  return [points.slice(0, splitPointIndex + 1), points.slice(splitPointIndex)];
}

export function connectContours(path, sourcePointIndex, targetPointIndex) {
  let selectedPointIndex;
  const [sourceContourIndex, sourceContourPointIndex] =
    path.getContourAndPointIndex(sourcePointIndex);
  const [targetContourIndex, targetContourPointIndex] =
    path.getContourAndPointIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // Close contour
    path.contourInfo[sourceContourIndex].isClosed = true;
    if (sourceContourPointIndex) {
      path.deletePoint(sourceContourIndex, sourceContourPointIndex);
    } else {
      // Ensure the target point becomes the start point
      path.setPoint(sourcePointIndex, path.getPoint(targetPointIndex));
      path.deletePoint(sourceContourIndex, targetContourPointIndex);
    }
    selectedPointIndex = sourceContourPointIndex ? targetPointIndex : sourcePointIndex;
  } else {
    // Connect contours
    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);
    if (!!sourceContourPointIndex == !!targetContourPointIndex) {
      targetContour.points.reverse();
    }
    sourceContour.points.splice(
      sourceContourPointIndex ? -1 : 0,
      1,
      ...targetContour.points
    );
    path.deleteContour(sourceContourIndex);
    path.insertUnpackedContour(sourceContourIndex, sourceContour);
    path.deleteContour(targetContourIndex);

    selectedPointIndex = path.getAbsolutePointIndex(
      targetContourIndex < sourceContourIndex
        ? sourceContourIndex - 1
        : sourceContourIndex,
      sourceContourPointIndex
        ? sourceContourPointIndex
        : targetContour.points.length - 1
    );
  }
  return new Set([`point/${selectedPointIndex}`]);
}

export function deleteSelectedPoints(path, pointIndices) {
  const contourFragmentsToDelete = preparePointDeletion(path, pointIndices);
  const contoursToDelete = [];
  for (const {
    contourIndex,
    fragmentsToDelete,
    startPoint,
  } of contourFragmentsToDelete) {
    if (!fragmentsToDelete) {
      contoursToDelete.push(contourIndex);
      continue;
    }
    let indexBias = 0;
    for (const fragment of reversed(fragmentsToDelete)) {
      const indices = fragment.indices.map((i) => i + indexBias);

      if (!fragment.contour) {
        // Start or end fragment of an open path: just delete points
        for (const index of reversed(indices)) {
          path.deletePoint(contourIndex, index);
        }
        continue;
      }

      const points = fragment.contour.points;
      const { curveType, onlyOffCurvePoints } = determineDominantCurveType(
        points.slice(1, -1)
      );
      const firstIndex = indices[0];
      const lastIndex = indices.at(-1);
      const wraps = lastIndex < firstIndex;
      if (wraps && indexBias) {
        throw new Error("assert -- unexpected index bias");
      }
      let insertIndex = firstIndex + 1;

      let newPoints;

      if (curveType && !onlyOffCurvePoints) {
        newPoints = computeHandlesFromFragment(curveType, fragment.contour);
      } else {
        newPoints = [];
        path.setPointType(indices[0] + startPoint + indexBias, points[0].type, false);
        path.setPointType(
          indices.at(-1) + startPoint + indexBias,
          points.at(-1).type,
          false
        );
      }
      for (const newPoint of newPoints) {
        path.insertPoint(contourIndex, insertIndex, newPoint);
        insertIndex++;
      }

      const delIndices = indices.slice(1, -1);
      delIndices.sort((a, b) => b - a); // reverse sort
      for (const index of delIndices) {
        let adjustedIndex;
        if (wraps && index < lastIndex) {
          adjustedIndex = index;
          indexBias--;
        } else {
          adjustedIndex = index + newPoints.length;
        }
        path.deletePoint(contourIndex, adjustedIndex);
      }
    }
  }

  contoursToDelete.sort((a, b) => b - a); // reverse sort
  contoursToDelete.forEach((i) => path.deleteContour(i));
}

function preparePointDeletion(path, pointIndices) {
  const contourFragmentsToDelete = [];
  const selectionByContour = getSelectionByContour(path, pointIndices);
  for (const [contourIndex, contourPointIndices] of selectionByContour.entries()) {
    contourFragmentsToDelete.push(
      findContourFragments(path, contourIndex, contourPointIndices)
    );
  }
  return contourFragmentsToDelete;
}

function findContourFragments(path, contourIndex, contourPointIndices) {
  const contour = path.getUnpackedContour(contourIndex);
  const startPoint = path.getAbsolutePointIndex(contourIndex, 0);

  const fragmentsToDelete = [];
  let allSelected = true;
  let previousSegment = null;
  for (const segment of iterSelectedSegments(
    path,
    contourPointIndices,
    contourIndex,
    startPoint
  )) {
    if (segment.selected) {
      if (previousSegment && segment.firstPointSelected) {
        fragmentsToDelete.at(-1).push(segment);
      } else {
        fragmentsToDelete.push([segment]);
      }
      previousSegment = segment.lastPointSelected ? segment : null;
      if (!segment.firstPointSelected || !segment.lastPointSelected) {
        allSelected = false;
      }
    } else {
      allSelected = false;
      previousSegment = null;
    }
  }

  if (
    fragmentsToDelete.length > 1 &&
    contour.isClosed &&
    previousSegment &&
    fragmentsToDelete[0]?.[0].firstPointSelected
  ) {
    // Wrap around
    fragmentsToDelete.at(-1).push(...fragmentsToDelete[0]);
    fragmentsToDelete.shift();
  }

  const { firstOnCurveIndex, lastOnCurveIndex } = findBoundaryOnCurvePoints(contour);

  const contourFragments = !allSelected
    ? fragmentsToDelete.map((segments) =>
        segmentsToContour(
          segments,
          path,
          contourIndex,
          startPoint,
          contour.isClosed,
          firstOnCurveIndex,
          lastOnCurveIndex
        )
      )
    : null;

  const { deleteLeadingOffCurves, deleteTrailingOffCurves } =
    shouldDeleteDanglingOffCurves(
      contour,
      contourPointIndices,
      firstOnCurveIndex,
      lastOnCurveIndex
    );

  if (deleteLeadingOffCurves) {
    contourFragments.unshift({ indices: [...range(0, firstOnCurveIndex)] });
  }
  if (deleteTrailingOffCurves) {
    contourFragments.push({
      indices: [...range(lastOnCurveIndex + 1, contour.points.length)],
    });
  }

  return {
    contourIndex,
    fragmentsToDelete: contourFragments,
    startPoint,
  };
}

function* iterSelectedSegments(path, contourPointIndices, contourIndex, startPoint) {
  const indexSet = new Set(contourPointIndices);
  for (const segment of path.iterContourSegmentPointIndices(contourIndex)) {
    const indices = segment.pointIndices.map((i) => i - startPoint);
    const firstPointSelected = indexSet.has(indices[0]);
    const lastPointSelected = indexSet.has(indices.at(-1));
    const selected =
      firstPointSelected ||
      lastPointSelected ||
      (indices.length > 2 && indices.slice(1, -1).some((i) => indexSet.has(i)));
    yield { selected, firstPointSelected, lastPointSelected, ...segment };
  }
}

function segmentsToContour(
  segments,
  path,
  contourIndex,
  startPoint,
  isClosed,
  firstOnCurveIndex,
  lastOnCurveIndex
) {
  let indices = [segments[0].pointIndices[0]];
  for (const segment of segments) {
    indices.push(...segment.pointIndices.slice(1));
  }
  indices = indices.map((i) => i - startPoint);

  if (!isClosed) {
    if (indices[0] === firstOnCurveIndex && segments[0].firstPointSelected) {
      // Delete entire leading fragment
      return { indices: [...range(0, indices.at(-1))] };
    } else if (
      indices.at(-1) === lastOnCurveIndex &&
      segments.at(-1).lastPointSelected
    ) {
      // Delete entire trailing fragment
      return {
        indices: [...range(indices[1], path.getNumPointsOfContour(contourIndex))],
      };
    }
  }

  return {
    indices,
    contour: {
      isClosed: false,
      points: indices.map((i) => path.getPoint(i + startPoint)),
    },
  };
}

function findBoundaryOnCurvePoints(contour) {
  let firstOnCurveIndex, lastOnCurveIndex;
  if (!contour.isClosed) {
    for (const [index, point] of enumerate(contour.points)) {
      if (!point.type) {
        if (firstOnCurveIndex === undefined) {
          firstOnCurveIndex = index;
        }
        lastOnCurveIndex = index;
      }
    }
  }
  return { firstOnCurveIndex, lastOnCurveIndex };
}

function shouldDeleteDanglingOffCurves(
  contour,
  contourPointIndices,
  firstOnCurveIndex,
  lastOnCurveIndex
) {
  const deleteLeadingOffCurves = firstOnCurveIndex
    ? contourPointIndices.some((i) => i < firstOnCurveIndex) &&
      contourPointIndices.indexOf(firstOnCurveIndex) < 0
    : false;
  const deleteTrailingOffCurves =
    lastOnCurveIndex !== contour.points.length - 1
      ? contourPointIndices.some((i) => i > lastOnCurveIndex) &&
        contourPointIndices.indexOf(lastOnCurveIndex) < 0
      : false;

  return { deleteLeadingOffCurves, deleteTrailingOffCurves };
}

function determineDominantCurveType(points) {
  const numOffCurvePoints = points.reduce((acc, pt) => acc + (pt.type ? 1 : 0), 0);
  const numQuadPoints = points.reduce(
    (acc, pt) => acc + (pt.type == POINT_TYPE_OFF_CURVE_QUAD ? 1 : 0),
    0
  );
  const curveType = numOffCurvePoints
    ? numQuadPoints > numOffCurvePoints / 2
      ? POINT_TYPE_OFF_CURVE_QUAD
      : POINT_TYPE_OFF_CURVE_CUBIC
    : null;
  return { curveType, onlyOffCurvePoints: numOffCurvePoints === points.length };
}

function computeHandlesFromFragment(curveType, contour) {
  const path = VarPackedPath.fromUnpackedContours([contour]);
  const samplePoints = [contour.points[0]];
  for (const segment of path.iterContourDecomposedSegments(0)) {
    const points = segment.points;
    if (points.length >= 3) {
      const bezier = new Bezier(...points);
      const ts = [0.2, 0.4, 0.6, 0.8];
      ts.forEach((t) => samplePoints.push(bezier.compute(t)));
    }
    samplePoints.push(points.at(-1));
  }
  const leftTangent = vector.normalizeVector(
    vector.subVectors(contour.points[1], contour.points[0])
  );
  const rightTangent = vector.normalizeVector(
    vector.subVectors(contour.points.at(-2), contour.points.at(-1))
  );
  const bezier = fitCubic(samplePoints, leftTangent, rightTangent, 0.5);
  let handle1, handle2;
  handle1 = bezier.points[1];
  handle2 = bezier.points[2];
  if (curveType === POINT_TYPE_OFF_CURVE_QUAD) {
    handle1 = scalePoint(contour.points[0], handle1, 0.75);
    handle2 = scalePoint(contour.points.at(-1), handle2, 0.75);
  }
  return [
    { ...handle1, type: curveType },
    { ...handle2, type: curveType },
  ];
}

export function scalePoint(pinPoint, point, factor) {
  return vector.addVectors(
    pinPoint,
    vector.mulVectorScalar(vector.subVectors(point, pinPoint), factor)
  );
}

export function getSelectionByContour(path, pointIndices) {
  const selectionByContour = new Map();
  for (const pointIndex of pointIndices) {
    const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
    if (!selectionByContour.has(contourIndex)) {
      selectionByContour.set(contourIndex, []);
    }
    selectionByContour.get(contourIndex).push(contourPointIndex);
  }
  return selectionByContour;
}

function splitContourPointRanges(indices, isClosed, numContourPoints) {
  const ranges = [];
  let currentRange;
  for (const i of indices) {
    if (currentRange && currentRange.at(-1) + 1 === i) {
      currentRange.push(i);
    } else {
      currentRange = [i];
      ranges.push(currentRange);
    }
  }
  _wrapStartRange(ranges, isClosed, numContourPoints);
  return ranges;
}

function invertContourPointRanges(ranges, isClosed, numContourPoints) {
  const invRanges = [];
  let prevEnd = isClosed ? undefined : 0;
  for (const rng of ranges) {
    if (prevEnd !== undefined && prevEnd !== rng[0]) {
      invRanges.push([...range(prevEnd, rng[0] + 1)]);
    }
    prevEnd = rng.at(-1);
  }
  if (isClosed) {
    const firstIndex = ranges[0][0];
    const lastIndex = ranges.at(-1).at(-1);
    let remainingIndex = lastIndex;
    const closingRange = [remainingIndex];
    do {
      remainingIndex = (remainingIndex + 1) % numContourPoints;
      closingRange.push(remainingIndex);
    } while (remainingIndex !== firstIndex);
    invRanges.push(closingRange);
  } else {
    if (!invRanges.length || (prevEnd && prevEnd !== numContourPoints - 1)) {
      invRanges.push([...range(prevEnd, numContourPoints)]);
    }
    _wrapStartRange(invRanges, isClosed, numContourPoints);
  }
  return invRanges;
}

function _wrapStartRange(ranges, isClosed, numContourPoints) {
  if (
    ranges.length > 1 &&
    isClosed &&
    ranges[0][0] === 0 &&
    ranges.at(-1).at(-1) + 1 === numContourPoints
  ) {
    const firstRange = ranges.shift();
    ranges.at(-1).push(...firstRange);
  }
}

function* rangesToContours(path, startPoint, ranges) {
  for (const contourPointIndices of ranges) {
    const points = contourPointIndices.map((i) => path.getPoint(i + startPoint));
    delete points[0].smooth;
    delete points.at(-1).smooth;
    yield { points: points, isClosed: false };
  }
}

export function toggleSmooth(path, pointIndices, newPointType) {
  for (const pointIndex of pointIndices) {
    const pointType = path.pointTypes[pointIndex];
    const [prevIndex, prevPoint, nextIndex, nextPoint] = neighborPoints(
      path,
      pointIndex
    );
    if (
      (!prevPoint || !nextPoint || (!prevPoint.type && !nextPoint.type)) &&
      pointType !== VarPackedPath.SMOOTH_FLAG
    ) {
      continue;
    }
    if (
      pointType === VarPackedPath.ON_CURVE ||
      pointType === VarPackedPath.SMOOTH_FLAG
    ) {
      if (newPointType === undefined) {
        // Compute new point type based on the primary editing layer
        newPointType =
          pointType === VarPackedPath.ON_CURVE
            ? VarPackedPath.SMOOTH_FLAG
            : VarPackedPath.ON_CURVE;
      }
      path.pointTypes[pointIndex] = newPointType;
      if (newPointType === VarPackedPath.SMOOTH_FLAG) {
        const anchorPoint = path.getPoint(pointIndex);
        if (prevPoint?.type && nextPoint?.type) {
          // Fix-up both incoming and outgoing handles
          const [newPrevPoint, newNextPoint] = alignHandles(
            prevPoint,
            anchorPoint,
            nextPoint
          );
          path.setPointPosition(prevIndex, newPrevPoint.x, newPrevPoint.y);
          path.setPointPosition(nextIndex, newNextPoint.x, newNextPoint.y);
        } else if (prevPoint?.type) {
          // Fix-up incoming handle
          const newPrevPoint = alignHandle(nextPoint, anchorPoint, prevPoint);
          path.setPointPosition(prevIndex, newPrevPoint.x, newPrevPoint.y);
        } else if (nextPoint?.type) {
          // Fix-up outgoing handle
          const newNextPoint = alignHandle(prevPoint, anchorPoint, nextPoint);
          path.setPointPosition(nextIndex, newNextPoint.x, newNextPoint.y);
        }
      }
    }
  }
  return newPointType;
}

function neighborPoints(path, pointIndex) {
  const [contourIndex, contourPointIndex] = path.getContourAndPointIndex(pointIndex);
  const contourStartIndex = path.getAbsolutePointIndex(contourIndex, 0);
  const numPoints = path.getNumPointsOfContour(contourIndex);
  const isClosed = path.contourInfo[contourIndex].isClosed;
  let prevIndex = contourPointIndex - 1;
  let nextIndex = contourPointIndex + 1;
  if (path.contourInfo[contourIndex].isClosed) {
    prevIndex = modulo(prevIndex, numPoints);
    nextIndex = modulo(nextIndex, numPoints);
  }
  let prevPoint, nextPoint;
  if (prevIndex >= 0) {
    prevIndex += contourStartIndex;
    prevPoint = path.getPoint(prevIndex);
  } else {
    prevIndex = undefined;
  }
  if (nextIndex < numPoints) {
    nextIndex += contourStartIndex;
    nextPoint = path.getPoint(nextIndex);
  } else {
    nextIndex = undefined;
  }
  return [prevIndex, prevPoint, nextIndex, nextPoint];
}

function alignHandle(refPoint1, anchorPoint, handlePoint) {
  const direction = vector.subVectors(anchorPoint, refPoint1);
  return alignHandleAlongDirection(direction, anchorPoint, handlePoint);
}

function alignHandles(handleIn, anchorPoint, handleOut) {
  const handleVectorIn = vector.subVectors(anchorPoint, handleIn);
  const handleVectorOut = vector.subVectors(anchorPoint, handleOut);
  const directionIn = vector.subVectors(handleVectorOut, handleVectorIn);
  const directionOut = vector.subVectors(handleVectorIn, handleVectorOut);
  return [
    alignHandleAlongDirection(directionIn, anchorPoint, handleIn),
    alignHandleAlongDirection(directionOut, anchorPoint, handleOut),
  ];
}

function alignHandleAlongDirection(direction, anchorPoint, handlePoint) {
  const length = vector.vectorLength(vector.subVectors(handlePoint, anchorPoint));
  const handleVector = vector.mulVectorScalar(
    vector.normalizeVector(direction),
    length
  );
  return vector.roundVector(vector.addVectors(anchorPoint, handleVector));
}

import { VariationError } from "./errors.js";
import { enumerate, isObjectEmpty, product, range, zip } from "./utils.js";
import { VariationModel, normalizeLocation } from "./var-model.js";

export class DiscreteVariationModel {
  constructor(locations, discreteAxes, continuousAxes) {
    this._discreteAxes = discreteAxes;
    this._continuousAxes = continuousAxes;
    this._locations = {};
    this._locationsKeyToDiscreteLocation = {};
    this._locationKeys = [];
    this._locationIndices = {};
    for (const [index, location] of enumerate(locations)) {
      const splitLoc = splitDiscreteLocation(location, discreteAxes);
      const key = JSON.stringify(splitLoc.discreteLocation);
      this._locationKeys.push(key);
      if (!this._locationIndices[key]) {
        this._locationIndices[key] = [index];
      } else {
        this._locationIndices[key].push(index);
      }
      const normalizedLocation = sparsifyLocation(
        normalizeLocation(splitLoc.location, continuousAxes)
      );
      if (!(key in this._locations)) {
        this._locations[key] = [normalizedLocation];
        this._locationsKeyToDiscreteLocation[key] = splitLoc.discreteLocation;
      } else {
        this._locations[key].push(normalizedLocation);
      }
    }
    this._models = {};
  }

  getDeltas(sourceValues) {
    const sources = {};
    for (const [key, value] of zip(this._locationKeys, sourceValues)) {
      if (!(key in sources)) {
        sources[key] = [value];
      } else {
        sources[key].push(value);
      }
    }
    return { sources, deltas: {} };
  }

  _getModel(key) {
    let cachedModelInfo = this._models[key];
    if (!cachedModelInfo) {
      let model;
      let usedKey = key;
      let errors = [];
      usedKey = key;
      const locations = this._locations[key];
      if (!locations) {
        const nearestKey = this._findNearestDiscreteLocationKey(key);
        const { model: substModel } = this._getModel(nearestKey);
        model = substModel;
        errors = [
          {
            message: `there are no sources for ${formatDiscreteLocationKey(key)}`,
            type: "model-warning",
          },
        ];
        usedKey = nearestKey;
      } else {
        try {
          model = new VariationModel(locations);
        } catch (exc) {
          if (!(exc instanceof VariationError)) {
            throw exc;
          }
          const niceKey = key ? `${formatDiscreteLocationKey(key)}: ` : "";
          errors.push({
            message: `${niceKey}${exc.message}`,
            type: "model-error",
          });
          model = new BrokenVariationModel(locations);
        }
      }
      cachedModelInfo = { model, usedKey, errors: errors.length ? errors : undefined };
      this._models[key] = cachedModelInfo;
    }
    return cachedModelInfo;
  }

  _findNearestDiscreteLocationKey(key) {
    const targetLocation = JSON.parse(key);
    const locationKeys = Object.keys(this._locationsKeyToDiscreteLocation);
    const locations = Object.values(this._locationsKeyToDiscreteLocation);
    const nearestIndex = findNearestLocationIndex(JSON.parse(key), locations);
    return locationKeys[nearestIndex];
  }

  interpolateFromDeltas(location, deltas) {
    const splitLoc = splitDiscreteLocation(location, this._discreteAxes);
    const key = JSON.stringify(splitLoc.discreteLocation);
    let { model, usedKey, errors } = this._getModel(key);
    if (!(key in deltas.deltas)) {
      try {
        deltas.deltas[key] = model.getDeltas(deltas.sources[usedKey]);
      } catch (exc) {
        if (!(exc instanceof VariationError)) {
          throw exc;
        }
        if (!errors) {
          errors = [];
        }
        errors.push({ message: exc.message, type: "interpolation-error" });
        model = new BrokenVariationModel(this._locations[key]);
        deltas.deltas[key] = model.getDeltas(deltas.sources[usedKey]);
        const cachedModelInfo = { model, usedKey, errors };
        this._models[key] = cachedModelInfo;
      }
    }
    const instance = model.interpolateFromDeltas(
      normalizeLocation(splitLoc.location, this._continuousAxes),
      deltas.deltas[key]
    );
    return { instance, errors };
  }

  getModelErrors() {
    const modelErrors = [];
    for (const key of Object.keys(this._locationsKeyToDiscreteLocation)) {
      const { errors } = this._getModel(key);
      if (errors) {
        modelErrors.push(...errors);
      }
    }
    return modelErrors;
  }

  getSourceContributions(location) {
    const splitLoc = splitDiscreteLocation(location, this._discreteAxes);
    const key = JSON.stringify(splitLoc.discreteLocation);
    const { model, usedKey } = this._getModel(key);
    const contributions = model.getSourceContributions(
      normalizeLocation(splitLoc.location, this._continuousAxes)
    );
    let index = 0;
    return this._locationKeys.map((k) =>
      k === usedKey ? contributions[index++] : null
    );
  }

  getDefaultSourceIndexForDiscreteLocation(discreteLocation) {
    const key = JSON.stringify(discreteLocation);
    const { model } = this._getModel(key);
    const localIndex = model.getDefaultSourceIndex() || 0;
    return this._locationIndices[key][localIndex];
  }
}

class BrokenVariationModel {
  constructor(locations) {
    this.locations = locations;
  }

  getDefaultSourceIndex() {
    for (const [index, loc] of enumerate(this.locations)) {
      if (isObjectEmpty(loc)) {
        return index;
      }
    }
  }

  getDeltas(sourceValues) {
    return sourceValues;
  }

  interpolateFromDeltas(location, deltas) {
    const index = findNearestLocationIndex(location, this.locations);
    return deltas[index];
  }

  getSourceContributions(location) {
    const index = findNearestLocationIndex(location, this.locations);
    const contributions = new Array(this.locations.length);
    contributions.fill(null);
    contributions[index] = 1;
    return contributions;
  }
}

export function splitDiscreteLocation(location, discreteAxes) {
  const discreteLocation = {};
  location = { ...location };
  for (const axis of discreteAxes) {
    let value = location[axis.name];
    if (value !== undefined) {
      delete location[axis.name];
      if (axis.values.indexOf(value) < 0) {
        // Ensure the value is actually in the values list
        value = findNearestValue(value, axis.values);
      }
    } else {
      value = axis.defaultValue;
    }
    discreteLocation[axis.name] = value;
  }
  return { discreteLocation, location };
}

function findNearestValue(value, values) {
  if (!values.length) {
    return value;
  }
  const decorated = values.map((v) => [Math.abs(v - value), v]);
  decorated.sort((a, b) => a[0] - b[0]);
  return decorated[0][1];
}

function getAllDiscreteLocations(discreteAxes) {
  const descreteLocations = [
    ...product(...discreteAxes.map((axis) => axis.values.map((v) => [axis.name, v]))),
  ];
  return descreteLocations.map((locs) => Object.fromEntries(locs));
}

export function sparsifyLocation(location) {
  // location must be normalized
  const sparseLocation = {};
  for (const [name, value] of Object.entries(location)) {
    if (value) {
      sparseLocation[name] = value;
    }
  }
  return sparseLocation;
}

export function findNearestLocationIndex(targetLocation, locations) {
  // Return the index of the location in `locations` that is nearest to
  // `targetLocation`.
  // If `locations` are sparse, they must be normalized.
  // `targetLocation` must *not* be sparse.
  let closestIndex;
  let smallestDistanceSquared;
  const locationEntries = Object.entries(targetLocation);
  for (const [index, loc] of enumerate(locations)) {
    let distanceSquared = 0;
    for (const [axisName, value] of locationEntries) {
      const otherValue = loc[axisName] || 0;
      distanceSquared += (value - otherValue) ** 2;
    }
    if (closestIndex === undefined || distanceSquared < smallestDistanceSquared) {
      closestIndex = index;
      smallestDistanceSquared = distanceSquared;
    }
  }
  return closestIndex;
}

function formatDiscreteLocationKey(key) {
  const loc = JSON.parse(key);
  return Object.entries(loc)
    .map(([axisName, value]) => `${axisName}=${value}`)
    .join(",");
}

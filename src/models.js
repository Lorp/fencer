// This is Behdad’s untested translation of the VariationModel class from fontTools.varLib.models
// "Just a ChatGPT translation. Untested"
// https://gist.github.com/behdad/3c5e6bd015b1a44f5f3b50774902eb52
// 
// Minor changes to make it work in the browser:
// - removed main() function
// - removed require('process');

function nonNone(lst) {
    return lst.filter(l => l !== null);
}

function allNone(lst) {
    return lst.every(l => l === null);
}

function allEqualTo(ref, lst, mapper = null) {
    if (mapper === null) {
        return lst.every(item => ref === item);
    }
    let mapped = mapper(ref);
    return lst.every(item => mapped === mapper(item));
}

function allEqual(lst, mapper = null) {
    if (lst.length === 0) {
        return true;
    }
    let first = lst[0];
    return allEqualTo(first, lst.slice(1), mapper);
}

function subList(truth, lst) {
    if (truth.length !== lst.length) {
        throw new Error("Lengths of truth and lst must be equal.");
    }
    return lst.filter((_, index) => truth[index]);
}

function normalizeValue(v, triple, extrapolate = false) {
    let [lower, defaultValue, upper] = triple;
    if (!(lower <= defaultValue && defaultValue <= upper)) {
        throw new Error(`Invalid axis values, must be minimum, default, maximum: ${lower.toFixed(3)}, ${defaultValue.toFixed(3)}, ${upper.toFixed(3)}`);
    }
    if (!extrapolate) {
        v = Math.max(Math.min(v, upper), lower);
    }

    if (v === defaultValue || lower === upper) {
        return 0.0;
    }

    if ((v < defaultValue && lower !== defaultValue) || (v > defaultValue && upper === defaultValue)) {
        return (v - defaultValue) / (defaultValue - lower);
    } else {
        if (!((v > defaultValue && upper !== defaultValue) || (v < defaultValue && lower === defaultValue))) {
            throw new Error(`Oops... v=${v}, triple=(${lower}, ${defaultValue}, ${upper})`);
        }
        return (v - defaultValue) / (upper - defaultValue);
    }
}

function normalizeLocation(location, axes, extrapolate = false, validate = false) {
    if (validate) {
        let locationKeys = new Set(Object.keys(location));
        let axesKeys = new Set(Object.keys(axes));
        if (!Array.from(locationKeys).every(key => axesKeys.has(key))) {
            throw new Error(`Invalid keys: ${Array.from(new Set([...locationKeys].filter(x => !axesKeys.has(x))))}`);
        }
    }

    let output = {};
    for (let [tag, triple] of Object.entries(axes)) {
        let v = location.hasOwnProperty(tag) ? location[tag] : triple[1];
        output[tag] = normalizeValue(v, triple, extrapolate);
    }
    return output;
}

function supportScalar(location, support, ot = true, extrapolate = false, axisRanges = null) {
    if (extrapolate && axisRanges === null) {
        throw new TypeError("axisRanges must be passed when extrapolate is True");
    }

    let scalar = 1.0;
    for (let axis in support) {
        let [lower, peak, upper] = support[axis];

        if (ot) {
            if (peak === 0.0) {
                continue;
            }
            if (lower > peak || peak > upper) {
                continue;
            }
            if (lower < 0.0 && upper > 0.0) {
                continue;
            }
        }

        let v = location.hasOwnProperty(axis) ? location[axis] : (ot ? 0.0 : null);
        if (!ot && v === null) {
            throw new Error(`Axis ${axis} must be in location`);
        }

        if (v === peak) {
            continue;
        }

        if (extrapolate) {
            let [axisMin, axisMax] = axisRanges[axis];
            if (v < axisMin && lower <= axisMin) {
                if (peak <= axisMin && peak < upper) {
                    scalar *= (v - upper) / (peak - upper);
                    continue;
                } else if (axisMin < peak) {
                    scalar *= (v - lower) / (peak - lower);
                    continue;
                }
            } else if (v > axisMax && axisMax <= upper) {
                if (axisMax <= peak && lower < peak) {
                    scalar *= (v - lower) / (peak - lower);
                    continue;
                } else if (peak < axisMax) {
                    scalar *= (v - upper) / (peak - upper);
                    continue;
                }
            }
        }

        if (v <= lower || v >= upper) {
            scalar = 0.0;
            break;
        }

        if (v < peak) {
            scalar *= (v - lower) / (peak - lower);
        } else {
            scalar *= (v - upper) / (peak - upper);
        }
    }
    return scalar;
}

class VariationModel {
    constructor(locations, axisOrder = null, extrapolate = false) {
        if (new Set(locations.map(l => JSON.stringify(Object.entries(l).sort()))).size !== locations.length) {
            throw new Error("Locations must be unique.");
        }

        this.origLocations = locations;
        this.axisOrder = axisOrder || [];
        this.extrapolate = extrapolate;
        this.axisRanges = extrapolate ? this.computeAxisRanges(locations) : null;

        let nonZeroLocations = locations.map(loc => 
            Object.fromEntries(Object.entries(loc).filter(([_, v]) => v !== 0))
        );

        let keyFunc = this.getMasterLocationsSortKeyFunc(nonZeroLocations, this.axisOrder);
        this.locations = nonZeroLocations.sort((a, b) => keyFunc(a) - keyFunc(b));

        this.mapping = this.locations.map(l => nonZeroLocations.indexOf(l));
        this.reverseMapping = nonZeroLocations.map(l => this.locations.indexOf(l));

        this._computeMasterSupports();
        this._subModels = {};
    }

    getSubModel(items) {
        if (!items.includes(null)) {
            return [this, items];
        }

        let key = items.map(v => v !== null);
        if (!this._subModels) {
            this._subModels = {};
        }
        let subModelKey = JSON.stringify(key);
        let subModel = this._subModels[subModelKey];

        if (!subModel) {
            subModel = new VariationModel(this.subList(key, this.origLocations), this.axisOrder);
            this._subModels[subModelKey] = subModel;
        }

        return [subModel, this.subList(key, items)];
    }

    static computeAxisRanges(locations) {
        let axisRanges = {};
        let allAxes = new Set(locations.flatMap(loc => Object.keys(loc)));

        for (let loc of locations) {
            for (let axis of allAxes) {
                let value = loc.hasOwnProperty(axis) ? loc[axis] : 0;
                let [axisMin, axisMax] = axisRanges[axis] || [value, value];
                axisRanges[axis] = [Math.min(value, axisMin), Math.max(value, axisMax)];
            }
        }

        return axisRanges;
    }

    // Utility function used in getSubModel
    subList(truth, lst) {
        return lst.map((item, index) => truth[index] ? item : null).filter(item => item !== null);
    }

    static getMasterLocationsSortKeyFunc(locations, axisOrder = []) {
        if (!locations.some(loc => Object.keys(loc).length === 0)) {
            throw new Error("Base master not found.");
        }

        let axisPoints = {};
        for (let loc of locations) {
            if (Object.keys(loc).length !== 1) {
                continue;
            }
            let axis = Object.keys(loc)[0];
            let value = loc[axis];
            if (!axisPoints[axis]) {
                axisPoints[axis] = new Set([0.0]);
            } else {
                if (axisPoints[axis].has(value)) {
                    throw new Error(`Value "${value}" in axisPoints["${axis}"] -->  ${JSON.stringify(Array.from(axisPoints[axis]))}`);
                }
            }
            axisPoints[axis].add(value);
        }

        return function key(loc) {
            let rank = Object.keys(loc).length;
            let onPointAxes = Object.keys(loc).filter(axis => axisPoints[axis] && axisPoints[axis].has(loc[axis]));
            let orderedAxes = axisOrder.filter(axis => loc.hasOwnProperty(axis));
            orderedAxes.push(...Object.keys(loc).filter(axis => !axisOrder.includes(axis)).sort());

            let axisOrderIndices = orderedAxes.map(axis => axisOrder.includes(axis) ? axisOrder.indexOf(axis) : 0x10000);
            let axisSigns = orderedAxes.map(axis => Math.sign(loc[axis]));
            let axisAbsValues = orderedAxes.map(axis => Math.abs(loc[axis]));

            return VariationModel.compositeSortKey([
                rank,
                -onPointAxes.length,
                axisOrderIndices,
                orderedAxes,
                axisSigns,
                axisAbsValues
            ]);
        };
    }

    static compositeSortKey(values) {
        return values.map(val => {
            if (Array.isArray(val)) {
                return `[${val.join(",")}]`;
            } else {
                return val.toString();
            }
        }).join("|");
    }

    reorderMasters(masterList, mapping) {
        let newList = mapping.map(idx => masterList[idx]);
        this.origLocations = mapping.map(idx => this.origLocations[idx]);

        let locations = this.origLocations.map(loc => 
            Object.fromEntries(Object.entries(loc).filter(([_, v]) => v !== 0))
        );

        this.mapping = locations.map(l => this.locations.findIndex(loc => JSON.stringify(loc) === JSON.stringify(l)));
        this.reverseMapping = this.locations.map(l => locations.findIndex(loc => JSON.stringify(loc) === JSON.stringify(l)));
        this._subModels = {};

        return newList;
    }

    _computeMasterSupports() {
        this.supports = [];
        let regions = this._locationsToRegions();

        for (let i = 0; i < regions.length; i++) {
            let region = regions[i];
            let locAxes = new Set(Object.keys(region));

            for (let j = 0; j < i; j++) {
                let prevRegion = regions[j];
                if (new Set(Object.keys(prevRegion)).size !== locAxes.size) {
                    continue;
                }

                let relevant = true;
                for (let axis in region) {
                    let [lower, peak, upper] = region[axis];
                    if (!(prevRegion[axis][1] === peak || (lower < prevRegion[axis][1] && prevRegion[axis][1] < upper))) {
                        relevant = false;
                        break;
                    }
                }

                if (!relevant) {
                    continue;
                }

                let bestAxes = {};
                let bestRatio = -1;
                for (let axis in prevRegion) {
                    let val = prevRegion[axis][1];
                    if (!(axis in region)) {
                        throw new Error("Axis missing in region");
                    }

                    let [lower, locV, upper] = region[axis];
                    let newLower = lower, newUpper = upper;
                    let ratio;
                    if (val < locV) {
                        newLower = val;
                        ratio = (val - locV) / (lower - locV);
                    } else if (locV < val) {
                        newUpper = val;
                        ratio = (val - locV) / (upper - locV);
                    } else {
                        continue;
                    }

                    if (ratio > bestRatio) {
                        bestAxes = {};
                        bestRatio = ratio;
                    }
                    if (ratio === bestRatio) {
                        bestAxes[axis] = [newLower, locV, newUpper];
                    }
                }

                for (let axis in bestAxes) {
                    region[axis] = bestAxes[axis];
                }
            }

            this.supports.push(region);
        }

        this._computeDeltaWeights();
    }

    _locationsToRegions() {
        let minV = {};
        let maxV = {};
        for (let loc of this.locations) {
            for (let [k, v] of Object.entries(loc)) {
                minV[k] = minV[k] !== undefined ? Math.min(v, minV[k]) : v;
                maxV[k] = maxV[k] !== undefined ? Math.max(v, maxV[k]) : v;
            }
        }

        let regions = [];
        for (let loc of this.locations) {
            let region = {};
            for (let [axis, locV] of Object.entries(loc)) {
                region[axis] = locV > 0 ? [0, locV, maxV[axis]] : [minV[axis], locV, 0];
            }
            regions.push(region);
        }
        return regions;
    }

    _computeDeltaWeights() {
        this.deltaWeights = [];
        for (let i = 0; i < this.locations.length; i++) {
            let loc = this.locations[i];
            let deltaWeight = {};
            for (let j = 0; j < i; j++) {
                let support = this.supports[j];
                let scalar = this.supportScalar(loc, support); // Ensure supportScalar function is defined
                if (scalar) {
                    deltaWeight[j] = scalar;
                }
            }
            this.deltaWeights.push(deltaWeight);
        }
    }

    getDeltas(masterValues, round = Math.round) {
        if (masterValues.length !== this.deltaWeights.length) {
            throw new Error(`Length mismatch: ${masterValues.length} vs ${this.deltaWeights.length}`);
        }
        let mapping = this.reverseMapping;
        let out = [];
        for (let i = 0; i < this.deltaWeights.length; i++) {
            let weights = this.deltaWeights[i];
            let delta = masterValues[mapping[i]];
            for (let j in weights) {
                let weight = weights[j];
                delta -= weight === 1 ? out[j] : out[j] * weight;
            }
            out.push(round(delta));
        }
        return out;
    }

    getDeltasAndSupports(items, round = Math.round) {
        let [model, newItems] = this.getSubModel(items);
        return [model.getDeltas(newItems, round), model.supports];
    }

    getScalars(loc) {
        return this.supports.map(support => 
            this.supportScalar(loc, support, this.extrapolate, this.axisRanges)
        );
    }

    getMasterScalars(targetLocation) {
        let out = this.getScalars(targetLocation);
        for (let i = this.deltaWeights.length - 1; i >= 0; i--) {
            let weights = this.deltaWeights[i];
            for (let j in weights) {
                let weight = weights[j];
                out[j] -= out[i] * weight;
            }
        }

        return this.mapping.map(i => out[i]);
    }

    static interpolateFromValuesAndScalars(values, scalars) {
        if (values.length !== scalars.length) {
            throw new Error("Values and scalars arrays must be of the same length.");
        }

        let v = null;
        for (let i = 0; i < values.length; i++) {
            let value = values[i];
            let scalar = scalars[i];
            if (!scalar) {
                continue;
            }
            let contribution = value * scalar;
            v = v === null ? contribution : v + contribution;
        }
        return v;
    }

    static interpolateFromDeltasAndScalars(deltas, scalars) {
        return VariationModel.interpolateFromValuesAndScalars(deltas, scalars);
    }

    interpolateFromDeltas(loc, deltas) {
        let scalars = this.getScalars(loc);
        return VariationModel.interpolateFromDeltasAndScalars(deltas, scalars);
    }

    interpolateFromMasters(loc, masterValues, round = Math.round) {
        let scalars = this.getMasterScalars(loc);
        return VariationModel.interpolateFromValuesAndScalars(masterValues, scalars).map(round);
    }

    interpolateFromMastersAndScalars(masterValues, scalars, round = Math.round) {
        let deltas = this.getDeltas(masterValues, round);
        return VariationModel.interpolateFromDeltasAndScalars(deltas, scalars);
    }
}

function piecewiseLinearMap(v, mapping) {
    let keys = Object.keys(mapping).map(Number).sort((a, b) => a - b);
    
    if (keys.length === 0) {
        return v;
    }
    if (mapping.hasOwnProperty(v)) {
        return mapping[v];
    }

    let k = Math.min(...keys);
    if (v < k) {
        return v + mapping[k] - k;
    }

    k = Math.max(...keys);
    if (v > k) {
        return v + mapping[k] - k;
    }

    // Interpolate
    let a = Math.max(...keys.filter(key => key < v));
    let b = Math.min(...keys.filter(key => key > v));
    let va = mapping[a];
    let vb = mapping[b];
    
    return va + (vb - va) * (v - a) / (b - a);
}


/*
const process = require('process');

function main(args) {
    // Assuming `args` is an array of command-line arguments
    let logLevel = "INFO";
    let designSpaceFile = null;
    let locations = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--loglevel" && i + 1 < args.length) {
            logLevel = args[i + 1];
            i++; // Skip next argument since it's part of this option
        } else if (args[i] === "-d" && i + 1 < args.length) {
            designSpaceFile = args[i + 1];
            i++;
        } else if (args[i] === "-l") {
            locations = [];
            for (let j = i + 1; j < args.length; j++) {
                if (args[j].startsWith("-")) {
                    break; // Next argument is a new option
                }
                locations.push(args[j]);
            }
        }
    }

    // Configure logger based on logLevel
    // JavaScript equivalent of logging configuration goes here

    if (designSpaceFile) {
        // Logic to handle design space file
        // Omitted in translation as JavaScript doesn't have a direct equivalent of fontTools
    } else if (locations) {
        const axes = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
        const locs = locations.map(s => Object.fromEntries(axes.map((a, i) => [a, parseFloat(s.split(',')[i] || "0")])));

        const model = new VariationModel(locs); // Assuming VariationModel is defined
        console.log("Sorted locations:");
        console.log(model.locations);
        console.log("Supports:");
        console.log(model.supports);
    }
}

if (require.main === module) {
    main(process.argv.slice(2));
}

*/

export { normalizeValue, piecewiseLinearMap };
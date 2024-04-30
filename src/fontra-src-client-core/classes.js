import { fetchJSON } from "./utils.js";
import { Layer, StaticGlyph, VariableGlyph } from "./var-glyph.js";
import { VarPackedPath } from "./var-path.js";

const classSchema = {};

let schemaPromise;

export function getClassSchema(rawSchema) {
  if (!schemaPromise) {
    let resolvePromise;
    schemaPromise = new Promise((resolve) => (resolvePromise = resolve));
    if (rawSchema) {
      populateSchema(rawSchema);
      resolvePromise(classSchema);
    } else {
      fetchJSON("/core/classes.json").then((result) => {
        populateSchema(result);
        resolvePromise(classSchema);
      });
    }
  }
  return schemaPromise;
}

function populateSchema(rawSchema) {
  for (const className in rawSchema) {
    classSchema[className] = new ClassDef(rawSchema[className], className);
  }
}

const castDefinitions = {
  VariableGlyph(classDef, value) {
    if (value.constructor !== VariableGlyph) {
      value = VariableGlyph.fromObject(value);
    }
    return value;
  },

  Layer(classDef, value) {
    if (value.constructor !== Layer) {
      value = Layer.fromObject(value);
    }
    return value;
  },

  StaticGlyph(classDef, value) {
    if (value.constructor !== StaticGlyph) {
      value = StaticGlyph.fromObject(value);
    }
    return value;
  },

  PackedPath(classDef, value) {
    if (value.constructor !== VarPackedPath) {
      value = VarPackedPath.fromObject(value);
    }
    return value;
  },

  list(classDef, value) {
    value = [...value.map(classDef.itemCast)];
    return value;
  },

  dict(classDef, value) {
    value = Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, classDef.itemCast(v)])
    );
    return value;
  },
};

class ClassDef {
  constructor(rawClassDef, className, subType) {
    this.rawClassDef = rawClassDef;
    this.className = className;
    this.subType = subType;
    this.compositeName = this.subType
      ? `${className}<${this.subType.className}>`
      : className;
    this.subTypeMapping = {};
    this.itemCast = this.subType
      ? this.subType.cast.bind(this.subType)
      : (value) => value;
  }

  getSubType(property) {
    if (this.subType) {
      return this.subType;
    }
    let subType = this.subTypeMapping[property];
    if (!subType) {
      const rawSubDef = this.rawClassDef[property];
      if (!rawSubDef) {
        throw TypeError(`Unknown subType ${property} of ${this.className}`);
      }
      if (rawSubDef.subtype) {
        // type<subType>
        if (!classSchema[rawSubDef.subtype]) {
          classSchema[rawSubDef.subtype] = new ClassDef(null, rawSubDef.subtype);
        }
        subType = new ClassDef(null, rawSubDef.type, classSchema[rawSubDef.subtype]);
      } else {
        if (!classSchema[rawSubDef.type]) {
          classSchema[rawSubDef.type] = new ClassDef(null, rawSubDef.type);
        }
        subType = classSchema[rawSubDef.type];
      }
      this.subTypeMapping[property] = subType;
    }
    return subType;
  }

  cast(value) {
    const caster = castDefinitions[this.className];
    if (caster) {
      value = caster(this, value);
    }
    return value;
  }
}

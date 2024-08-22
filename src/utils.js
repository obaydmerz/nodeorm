export function checkPropsOf(obj, ...props) {
  if (typeof obj !== "object") return false;
  for (const prop of props) {
    if (!obj.hasOwnProperty(prop)) return false;
  }
  return true;
}

export function prepareObj(obj, join = " AND ") {
  const preps = [];
  const str = Object.keys(obj)
    .filter((e) => !e.startsWith("%"))
    .map((e) => {
      preps.push(e, obj[e]);
      return "?? " + (obj["%" + e] || "=") + " ?";
    })
    .join(join);

  return { str, preps };
}

/**
 * Only return objects items that their keys included in mask.
 */
export function maskObject(object, mask) {
  const nObject = {};
  for (const key of mask) {
    if (Object.hasOwnProperty.call(object, key)) {
      nObject[key] = object[key];
    }
  }
  return nObject;
}

String.prototype.toPlural = function () {
  if (this.endsWith("y")) {
    return this.slice(0, -1) + "ies";
  }
  if (
    this.endsWith("s") ||
    this.endsWith("x") ||
    this.endsWith("z") ||
    this.endsWith("ch") ||
    this.endsWith("sh")
  ) {
    return this + "es";
  }
  return this + "s";
};

String.prototype.toSingular = function () {
  if (this.endsWith("ies")) {
    return this.slice(0, -3) + "y";
  }
  if (
    this.endsWith("ses") ||
    this.endsWith("xes") ||
    this.endsWith("zes") ||
    this.endsWith("ches") ||
    this.endsWith("shes")
  ) {
    return this.slice(0, -2);
  }
  if (this.endsWith("s")) {
    return this.slice(0, -1);
  }
  return this;
};

String.prototype.safe = function () {
  const d = new String(this);
  d._safe = true;
  return d;
};

/**
 * If `cond` content is valuable -> return data
 *
 * Else -> return ""
 */
String.prototype.cond = function (cond) {
  if (Array.isArray(cond) && cond.length === 0) return "";

  if (typeof cond === "object") {
    if (cond === null || Object.keys(cond).length === 0) return "";
  }

  if (cond.length == 0) return "";

  return this;
};

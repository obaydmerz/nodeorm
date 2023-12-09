import { Model } from "../index.js";

export class Collection {
  #arr = [];
  #conf = {};

  constructor(arrayOfObjects, { newCreationTemplate, createModel } = {}) {
    //this.#tmpl = tmpl || {};
    this.#conf.newCreationTemplate = { ...newCreationTemplate };
    this.#conf.createModel = createModel || undefined;
    this.#arr = arrayOfObjects || [];
  }

  count() {
    return this.#arr.length;
  }

  create(template = {}) {
    if (
      this.#conf.createModel == undefined ||
      !(this.#conf.createModel.prototype instanceof Model)
    ) {
      return console.error("Collection: No modal provided.");
    }
    return this.#conf.createModel.create({
      ...this.#conf.newCreationTemplate,
      ...template,
    });
  }

  toArray(column = undefined) {
    if (typeof column === "string") {
      const result = [];
      for (const item of this.#arr) {
        result.push(item.data[column]);
      }
      return result;
    }

    return this.#arr;
  }

  push(...results) {
    this.#arr.push(...results);
  }

  toObject(column) {
    const result = {};

    for (const item of this.#arr) {
      result[item.data[column]] = item;
    }

    return result;
  }

  last(modIndex = 0) {
    const lastIndex = this.#arr.length - 1 + modIndex;
    return lastIndex >= 0 ? this.#arr[lastIndex] : undefined;
  }

  first(modIndex = 0) {
    const firstIndex = 0 + modIndex;
    return firstIndex < this.#arr.length ? this.#arr[firstIndex] : undefined;
  }

  async each(callback = async (item, index) => {}) {
    if (typeof callback !== "function") return;

    var success = true;

    await Promise.all(
      this.#arr.map(async (element, i) => {
        const res = await callback(element, i);
        if (res != undefined && !res) {
          success = false;
        }
      })
    );

    return success;
  }

  async delete() {
    for (const item of this.#arr) {
      await item.delete();
    }
  }
}

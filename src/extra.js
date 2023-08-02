import { ModelItem } from "../index.js";
import { Collection } from "./collection.js";

export async function getJoinedSelection(model, result, joins, newCreationTemplate) {
  const res = new Collection([], {
    createModel: model,
    newCreationTemplate: newCreationTemplate,
  });

  for (const iterator of result) {
    const data = {};
    const belongs = {};

    for (const join of joins) {
      const joinData = {};
      for (const joinCol of join.columns) {
        const columnKey = `${join.table}.${joinCol}`;
        if (iterator[columnKey] !== undefined) {
          joinData[joinCol] = iterator[columnKey];
        }
      }

      belongs[join.name] = new ModelItem(
        join,
        defaultModelCallbacks(that.dbdriver),
        joinData
      );
    }

    for (const column of model.columns) {
      if (!model.columns.includes(column)) {
        continue;
      }
      data[column] = iterator[column];
    }

    res.push(
      new ModelItem(model, data, belongs)
    );
  }

  return res;
}

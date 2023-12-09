export class LibraryNotFound extends Error {}

export class EmptyDataError extends Error {
  name = "EmptyDataError";
  code = "";
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export class UnmatchingStateError extends Error {
  name = "UnmatchingStateError";
  code = "";
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export function fire(err, condition = undefined) {
  if (condition == undefined || condition) {
    if (err instanceof Error) {
      throw err;
    } else {
      let error = new (err.error || Error)(err.message);
      error.code = err.code;
      throw error;
    }
  }
}

export const errors = {
  uninitilazedModel: {
    message: "Cannot use an uninitilazed Model",
    code: "uninitilazedModel",
    error: UnmatchingStateError,
  },
};

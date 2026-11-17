// An error that knows which HTTP status to send. Throw it anywhere in a route;
// the error handler in index.js turns it into { "error": "message" }.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = "Not found") => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

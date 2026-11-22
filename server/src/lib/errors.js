'use strict';
class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const notFound = (what = 'Record') => new AppError(404, `${what} not found`, 'NOT_FOUND');
const badRequest = (msg, details) => new AppError(400, msg, 'BAD_REQUEST', details);
const conflict = (msg) => new AppError(409, msg, 'CONFLICT');
const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, msg, 'FORBIDDEN');
module.exports = { AppError, notFound, badRequest, conflict, forbidden };

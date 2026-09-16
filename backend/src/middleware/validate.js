/**
 * validate({ body, params, query }) — runs zod schemas over the matching
 * request parts, strips unknown keys (schemas are `.strict()` upstream or
 * zod's default-strip behavior applies), and replaces req.<part> with the
 * parsed/coerced result. On failure: a 400 with a field-level error list,
 * never an echo of the raw input (architecture.md §4.3).
 */
'use strict';

const ApiError = require('../lib/ApiError');

function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    for (const part of ['body', 'params', 'query']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        throw ApiError.badRequest('Validation failed', result.error.flatten().fieldErrors);
      }
      // Express 5 defines req.query as a read-only getter (parsed lazily from
      // the URL) — a plain `req.query = ...` throws ("Cannot set property
      // query of #<IncomingMessage> which has only a getter"). Redefining the
      // property replaces the getter with a plain writable value on this
      // request instance; harmless for body/params, which were already plain
      // writable properties.
      Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
    }
    next();
  };
}

module.exports = validate;

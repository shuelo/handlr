import dot from 'dot-object';
import to from 'await-to-js';

import { ValidationError } from './errors';

///
/// Public API
///

export async function sanitize(schema, input) {
  let sanitized = {};
  let failures = {};

  // Run field sanitizers
  let promises = {};
  for (let fieldName in schema) {
    if (fieldName === '_global') continue; // Keep that one for later
    promises[fieldName] = sanitizeField(schema[fieldName], dot.pick(fieldName, input))
      .then(([err, result]) => {
        if (err) {
          if (typeof err === 'object') Object.assign(failures, err);
          else failures[schema[fieldName].name || fieldName] = err;
        }
        else dot.str(fieldName, result, sanitized);
      });
  }
  const [err] = await to(Promise.all(Object.values(promises)));
  if (err) { throw err; }
  if (Object.keys(failures).length) {
    throw new ValidationError(failures, 'Input values do not conform to the expected schema');
  }

  return sanitized;
}

export function compile(schema) {

  // Adapt type
  let compiled;
  if (Array.isArray(schema)) {
    compiled = {};
    schema.forEach(fieldName => compiled[fieldName] = true);
  }
  else if (typeof schema === 'object') compiled = Object.assign({}, schema);
  else compiled = {};

  // Format validators
  for (let fieldName of Object.keys(compiled)) {
    compiled[fieldName] = _compileField(compiled[fieldName]);
  }

  return compiled;
}

function _compileField(fieldSchema) {
  if (typeof fieldSchema !== 'object') return {};
  if (fieldSchema.properties) fieldSchema.properties = compile(fieldSchema.properties);
  if (fieldSchema.array) fieldSchema.array = _compileField(fieldSchema.array);
  if (!fieldSchema.validators) return fieldSchema;
  fieldSchema.validators = fieldSchema.validators.map(validator => {
    if (!Array.isArray(validator)) return [validator, 'invalid'];
    else if (validator.length < 2) return validator.concat(['invalid']);
  });
  return fieldSchema;
}

///
/// Handlers
///

async function sanitizeField(fieldSchema, fieldValue) {

  // Test required
  if (fieldValue == null) {
    if (fieldSchema.required) {
      if (fieldSchema.default == null) return [fieldSchema.required !== true ? fieldSchema.required : 'required'];
      return [null, fieldSchema.default]
    }
    return [];
  }

  // If field is an object (has properties), recursively validate it
  if (fieldSchema.properties) {
    let sanitizedProperties;
    try {
      sanitizedProperties = await sanitize(fieldSchema.properties, fieldValue || {}); 
    } catch(err) {
      if (err instanceof ValidationError) return [err.cause, null];
      else throw err;
    }
  }

  // If field is an array or a set, sanitize and validate each element (size delayed, we need to uniquify the set afterwards)
  else if (fieldSchema.array) {
    if (!Array.isArray(fieldValue)) return ['invalid'];
    try {
      fieldValue = await Promise.all(fieldValue.map(async value => {
        let [err, formatted] = await sanitizeField(fieldSchema.array, value);
        if (err) throw err;
        return formatted;
      }));
    } catch (err) {
      if (typeof err === 'string') return [err];
      else if (err instanceof ValidationError) return ['invalid'];
      throw err;
    }
  }

  // Run formatters
  if (fieldSchema.formatters) {
    fieldValue = fieldSchema.formatters.reduce((value, formatter) => formatter(value), fieldValue);
  }

  // Run validators
  if (fieldSchema.validators) {
    for (let [validator, message] of fieldSchema.validators) {
      const validationResult = await Promise.resolve(validator(fieldValue));
      if (!validationResult) return [message];
    }
  }

  return [null, fieldValue];
}
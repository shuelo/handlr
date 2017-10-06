import { format } from 'util';

import ExtendableError from 'extendable-error-class';

///
/// Error classes
///

export class HandlrError extends ExtendableError {
  constructor(status, ...args) {
    let cause;
    let message;
    if (typeof args[0] !== 'string') {
      cause = args[0];
      message = format.apply(null, args.slice(1));
    } else {
      cause = null;
      message = format(...args);
    }
    super(message.length ? message : null);
    this.name = 'generic_error';
    this.cause = cause;
    this.status = status;
  }
}

export class ValidationError extends HandlrError {
  constructor(...args) {
    super(400, ...args);
    this.name = 'validation_error';
  }
}

export class ValueError extends HandlrError {
  constructor(...args) {
    super(400, ...args);
    this.name = 'value_error';
  }
}

export class AuthenticationError extends HandlrError {
  constructor(...args) {
    super(401, ...args);
    this.name = 'authentication_error';
  }
}

export class DeniedError extends HandlrError {
  constructor(...args) {
    super(403, ...args);
    this.name = 'forbidden';
  }
}
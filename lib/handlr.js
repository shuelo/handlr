import dot from 'dot-object';

import { sanitize, compile } from './sanitize';
import * as errors from './errors';

export default class Handlr {
  
  ///
  /// Constructor
  ///

  constructor() {

    this._registry = {
      middleware: {},
      handlers: [],
      initializers: [],
      errors: errors
    }
    this._stack = [];
    this._context = {};

  }

  ///
  /// Public API
  ///

  /// Run initializers

  async initialize() {
    let context = Object.assign({}, this._context, { handlers: {} });

    // Execute initializers
    for (let initializer of this._registry.initializers) {
      await Promise.resolve(initializer.before(context));
    }

    // Compute global middleware stack
    let stack = this._stack.slice();
    stack.sort(([f1, p1], [f2, p2]) => p1 > p2);
    stack = stack.map(([f, p]) => f);

    // Set handlers
    for (let handler of this._registry.handlers) {
      if (handler.dev === true && process.env.NODE_ENV == 'production') continue;
      context.handlers[handler.name] = this._wrap(handler, stack, context);
    }

    return context;
  }

  // Register handler

  handler(handlers) {
    Object.values(handlers).forEach(handler => {
      this._registry.handlers.push(typeof handler === 'function' ? handler(this._registry) : handler);
    });
  }

  /// Register middleware

  middleware(middleware) {
    Object.values(middleware).forEach(mw => {
      if (typeof mw === 'function') mw = mw(this._registry);
      this._registry.middleware[mw.name] = (...args) => mw.generate(...args) || mw.run;
      if (mw.global) {
        this._stack.push([mw.run, mw.priority || 100]);
      }
    });
  }

  /// Register initializer
 
  initializer(initializers) {
    Object.values(initializers).forEach(initializer => {
      this._registry.initializers.push(typeof initializer === 'function' ? initializer(this._registry) : initializer);
    });
  }

  /// Set context

  set(path, value) {
    dot.str(path, value, this._context);
  }

  ///
  /// Internal methods
  ///

  /// Wrap functon with built-in sugar

  _wrap(handler, globalStack, context) {

    // Transform inpur as proper schema
    const validationSchema = compile(handler.input);

    // Prepare execution function
    const run = async (context, data) => {
      const sanitized = await sanitize(validationSchema, data);
      await Promise.resolve(handler.run(context, sanitized));
      Object.assign(data, sanitized);
    }

    const stack = globalStack.concat(handler.middleware || [], [run]);

    // Return executor
    return async (data) => {
      data.error = null;
      data.response = {};
      data.status = 200;
      let step = 0;
      const execOne = async (i) => {
        ++step;
        await stack[i](context, data, async () => {
          await execOne(i + 1);
        });
        if (--step != i) console.log('WARNING: Out of order stack execution -- would an await be missing in middleware?');
      }

      try {
        await execOne(0);
      } catch(err) {
        data.error = err;
      }

      return [data.error, data.response, data.status];
    }
  }

  ///
  /// Static helpers
  ///

  static isHandler(what) {
    return what.name && typeof what.run === 'function';
  }

}
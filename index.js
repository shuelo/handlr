import Handlr from './lib/handlr';
import * as errors from './lib/errors';
import { sanitize, compile } from './lib/sanitize';

Handlr.errors = errors;

export default Handlr;
export { sanitize, compile };
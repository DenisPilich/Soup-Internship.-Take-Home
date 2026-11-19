import type { ApiKeyContext } from './auth/apiKey.js';
import type { SessionContext } from './auth/session.js';

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
      session?: SessionContext;
    }
  }
}

export {};

import type { NextFunction, Request, Response } from 'express';
import { verifyApiKey } from '../auth/apiKey.js';
import { resolveSession } from '../auth/session.js';
import { HttpError } from '../errors.js';
import { readCookie } from './cookies.js';

export async function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization') ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

  const key = await verifyApiKey(raw);
  if (!key) throw new HttpError(401, 'invalid_key');

  req.apiKey = key;
  next();
}

export async function requireSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readCookie(req.headers.cookie, 'soup_session');
  const session = token ? await resolveSession(token) : null;

  if (!session) throw new HttpError(401, 'not_authenticated');

  req.session = session;
  next();
}

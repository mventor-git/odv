import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config.ts';

/** Three-tier auth model (ticket 117):
 *  - dev   : Dev only — its own tier, above all admins
 *  - admin : Document Controller, Project Manager, Technical Office Engineer, Executive Manager
 *  - engineer : everyone else */
export type AuthRole = 'dev' | 'admin' | 'engineer';

export interface AuthUser {
  id: number;
  username: string;
  role: AuthRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser, config: Config): string {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role },
    config.jwtSecret,
    { expiresIn: config.tokenTtl as jwt.SignOptions['expiresIn'] },
  );
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const payload = jwt.verify(token, (req.app.locals.config as Config).jwtSecret) as jwt.JwtPayload;
    req.user = {
      id: Number(payload.sub),
      username: String(payload.username ?? ''),
      // Preserve the stored system role; normalise invalid values to engineer.
      role: (['dev', 'admin', 'engineer'].includes(payload.role as string) ? payload.role : 'engineer') as AuthRole,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** adminRequired: allows both 'admin' and 'dev' — DC/PM/TOE/EM + Dev. */
export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin' && req.user?.role !== 'dev') {
    res.status(403).json({ error: 'Admin privileges required' });
    return;
  }
  next();
}

/** devRequired: Dev only — its own tier above all admins. */
export function devRequired(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'dev') {
    res.status(403).json({ error: 'Dev privileges required' });
    return;
  }
  next();
}

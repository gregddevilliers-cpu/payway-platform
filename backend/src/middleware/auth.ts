import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../types/index';

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  operatorId: string | null;
  fleetId: string | null;
  firstName: string;
  lastName: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  let token: string | undefined;

  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  } else if (req.query._token && typeof req.query._token === 'string') {
    // Fallback: accept token via query param for browser-initiated downloads (e.g. PDF export)
    token = req.query._token;
  }

  if (!token) {
    res.status(401).json({ success: false, errors: ['Authentication required'] });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      operatorId: payload.operatorId,
      fleetId: payload.fleetId,
      firstName: payload.firstName,
      lastName: payload.lastName,
    } satisfies AuthUser;
    next();
  } catch {
    res.status(401).json({ success: false, errors: ['Invalid or expired token'] });
  }
}

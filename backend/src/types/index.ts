import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  operatorId: string | null;
  fleetId: string | null;
  firstName: string;
  lastName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  errors?: string[];
}

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return { success: true, data, ...(meta ? { meta } : {}) };
}

export function fail(errors: string | string[], status?: number): ApiResponse {
  return { success: false, errors: Array.isArray(errors) ? errors : [errors] };
}

export type AuthRequest = Request & { user: AuthUser };

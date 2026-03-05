import { Request, Response, NextFunction } from 'express';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OPERATOR_ADMIN: 'operator_admin',
  FLEET_MANAGER: 'fleet_manager',
  DRIVER: 'driver',
} as const;

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, errors: ['Authentication required'] });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, errors: ['Insufficient permissions'] });
      return;
    }
    next();
  };
}

// Shorthand role groups
export const isSuperAdmin = requireRole(ROLES.SUPER_ADMIN);
export const isAdmin = requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN);
export const isManager = requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER);
export const isAny = requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER, ROLES.DRIVER);

// Resolves the operatorId to scope queries (super_admin sees all if no filter; others see only their own)
export function getOperatorScope(req: Request): string | undefined {
  if (req.user?.role === ROLES.SUPER_ADMIN) {
    // super_admin can optionally filter by operatorId via query param
    return (req.query.operatorId as string) ?? undefined;
  }
  return req.user?.operatorId ?? undefined;
}

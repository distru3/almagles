import type { Request, Response, NextFunction } from 'express';

export type Role = 'visitor' | 'writer' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  managedCategoryIds: string[];
  canManageSchedule: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ message: 'يرجى تسجيل الدخول أولاً' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'هذا الإجراء متاح للمشرفين فقط' });
  }
  next();
}

/** Super admin OR a user granted schedule management. */
export function requireScheduleManager(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'يرجى تسجيل الدخول أولاً' });
  if (user.role !== 'admin' && !user.canManageSchedule) {
    return res.status(403).json({ message: 'هذا الإجراء متاح لإدارة الجدول فقط' });
  }
  next();
}

/**
 * Super admin OR a writer with at least one category. Runs before the upload
 * parser so other accounts can't push images into memory just to get a 403.
 */
export function requirePublisher(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return res.status(401).json({ message: 'يرجى تسجيل الدخول أولاً' });
  if (user.role !== 'admin' && user.managedCategoryIds.length === 0) {
    return res.status(403).json({ message: 'لا يمكنك النشر' });
  }
  next();
}

/** True when the user is super admin or manages the given category. */
export function canManageCategory(user: AuthUser | undefined, categoryId: string): boolean {
  return user?.role === 'admin' || (user?.managedCategoryIds.includes(categoryId) ?? false);
}
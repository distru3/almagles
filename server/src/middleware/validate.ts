import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'بيانات غير صالحة';
      return res.status(400).json({ message });
    }
    if (source === 'body') req.body = result.data;
    else req.query = result.data as any;
    next();
  };
}
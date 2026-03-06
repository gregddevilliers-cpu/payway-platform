import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      errors: [err.message],
    });
    return;
  }

  // Prisma unique constraint violation
  if ((err as NodeJS.ErrnoException).code === 'P2002') {
    res.status(409).json({
      success: false,
      errors: ['A record with this value already exists'],
    });
    return;
  }

  // Prisma record not found
  if ((err as NodeJS.ErrnoException).code === 'P2025') {
    res.status(404).json({
      success: false,
      errors: ['Record not found'],
    });
    return;
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    errors: ['Internal server error'],
  });
}

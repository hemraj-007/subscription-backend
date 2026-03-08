import { Request, Response, NextFunction } from "express";

/**
 * Logs request method, path, and response status. Does not log
 * Authorization, Cookie, or any request/response body (PII-safe).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      [new Date().toISOString(), req.method, req.path, res.statusCode, `${duration}ms`].join(" ")
    );
  });
  next();
}

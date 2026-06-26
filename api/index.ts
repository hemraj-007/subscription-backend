// Vercel serverless entry point. Vercel invokes the default export as the
// request handler; an Express app is itself a (req, res) handler, so we just
// re-export it. Note: src/server.ts (app.listen + node-cron) is intentionally
// NOT imported here — cron jobs do not run on serverless (use Vercel Cron).
import app from "../src/app";

export default app;

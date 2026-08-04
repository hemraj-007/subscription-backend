import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import rateLimit from "express-rate-limit";

async function withServer(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>
) {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function getStatus(
  baseUrl: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<number> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  // Drain body so sockets can close promptly under the limiter.
  await res.text();
  return res.status;
}

function buildApp(opts: { trustProxy: boolean; max: number; skipJobs?: boolean }) {
  const app = express();
  if (opts.trustProxy) {
    app.set("trust proxy", 1);
  }

  const limiter = rateLimit({
    windowMs: 60_000,
    max: opts.max,
    message: { message: "Too many requests; try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    ...(opts.skipJobs
      ? {
          skip: (req: IncomingMessage & { path?: string }) => {
            const path = req.path || "";
            return path === "/jobs/run" || path.endsWith("/jobs/run");
          },
        }
      : {}),
  });

  app.use(limiter);
  app.get("/ping", (_req, res: ServerResponse) => {
    res.statusCode = 200;
    res.end("ok");
  });
  app.get("/jobs/run", (_req, res: ServerResponse) => {
    res.statusCode = 200;
    res.end("cron");
  });
  return app;
}

test("with trust proxy, distinct X-Forwarded-For clients get separate buckets", async () => {
  const app = buildApp({ trustProxy: true, max: 2 });

  await withServer(app, async (baseUrl) => {
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.10" }), 200);
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.10" }), 200);
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.10" }), 429);

    // A different client IP must not be locked out by the first client's quota.
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.20" }), 200);
  });
});

test("without trust proxy, distinct X-Forwarded-For clients share one bucket", async () => {
  const app = buildApp({ trustProxy: false, max: 2 });

  await withServer(app, async (baseUrl) => {
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.10" }), 200);
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.20" }), 200);
    // Third request from yet another claimed client IP still hits the shared proxy bucket.
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "203.0.113.30" }), 429);
  });
});

test("api rate limiter skip allows /jobs/run after client quota is exhausted", async () => {
  const app = buildApp({ trustProxy: true, max: 1, skipJobs: true });

  await withServer(app, async (baseUrl) => {
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "198.51.100.7" }), 200);
    assert.equal(await getStatus(baseUrl, "/ping", { "X-Forwarded-For": "198.51.100.7" }), 429);
    assert.equal(await getStatus(baseUrl, "/jobs/run", { "X-Forwarded-For": "198.51.100.7" }), 200);
  });
});

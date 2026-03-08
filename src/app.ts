import express from "express";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./config/prisma";
import { env } from "./config/env";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import routes from "./routes";

const app = express();

app.use(helmet());

const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : ["*"];

const corsOptions = {
  origin: allowedOrigins.length === 1 && allowedOrigins[0] === "*" ? "*" : allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

app.get("/health", (_, res) => {
  res.json({ status: "OK" });
});

app.get("/db-test", async (_, res) => {
  await prisma.$connect();
  res.json({ db: "connected" });
});

app.use("/api", routes);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ 
    message: "Route not found",
    path: req.path,
    method: req.method
  });
});

// Error handler middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
});

export default app;
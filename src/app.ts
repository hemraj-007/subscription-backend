import express from "express";
import cors from "cors";
import helmet from "helmet";
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

app.use("/api", routes);

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ 
    message: "Route not found",
    path: req.path,
    method: req.method
  });
});

// Error handler middleware (handles multer upload errors with safe messages)
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "Statement file is too large; maximum 5MB" });
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ message: "Unexpected file field; use field name 'file'" });
  }
  const status = err.status ?? err.statusCode ?? 500;
  const message =
    status >= 500
      ? "Internal server error"
      : (err.message || "Request failed");
  res.status(status).json({
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
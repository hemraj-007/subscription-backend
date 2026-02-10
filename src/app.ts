import express from "express";
import cors from "cors";
import { prisma } from "./config/prisma";
import routes from "./routes";

const app = express();

// CORS configuration - must be before other middleware
const corsOptions = {
  origin: "*", // In production, replace with specific origins
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false,
  preflightContinue: false,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

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
const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.set("trust proxy", 1); // Render proxy

// Cấu hình CORS chặt chẽ: cho phép github.io, localhost và các origin trong danh sách CORS_ORIGINS
app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép khi mở file trực tiếp (origin === 'null' hoặc undefined), tên miền github.io hoặc danh sách cấu hình
      if (
        !origin ||
        origin === "null" ||
        env.corsOrigins.includes(origin) ||
        origin.endsWith(".github.io") ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "If-None-Match"],
    exposedHeaders: ["Location", "ETag"],
    maxAge: 86400,
  })
);

app.use(express.json({ limit: "100kb" }));

// Định tuyến API theo tiền tố /api/v1
app.use("/api/v1", require("./routes/auth.routes"));
app.use("/api/v1/users", require("./routes/users.routes"));
app.use("/api/v1/roles", require("./routes/roles.routes"));
app.use("/api/v1/permissions", require("./routes/permissions.routes"));
app.use("/api/v1/audit-logs", require("./routes/audit.routes"));

// Endpoint kiểm tra sức khỏe hệ thống
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// 404 & error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;

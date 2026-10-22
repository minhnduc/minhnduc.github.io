const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const toList = (value) => (value || "").split(",").map((item) => item.trim()).filter(Boolean);

function toPositiveInt(value, fallback) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number > 0 ? number : NaN;
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toPositiveInt(process.env.PORT, 3001),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  tokenTtl: toPositiveInt(process.env.ACCESS_TOKEN_TTL, 3600),
  corsOrigins: toList(process.env.CORS_ORIGINS),
  loginMaxAttempts: toPositiveInt(process.env.LOGIN_MAX_ATTEMPTS, 5),
  loginWindowMs: toPositiveInt(process.env.LOGIN_WINDOW_MINUTES, 15) * 60 * 1000,
};

/** Dừng server ngay khi khởi động nếu cấu hình thiếu, thay vì lỗi mơ hồ lúc chạy. */
function assertEnv() {
  const problems = [];
  if (!env.mongoUri) problems.push("MONGODB_URI");
  if (!env.jwtSecret || env.jwtSecret.length < 32) problems.push("JWT_SECRET (tối thiểu 32 ký tự)");
  for (const key of ["port", "tokenTtl", "loginMaxAttempts", "loginWindowMs"]) {
    if (Number.isNaN(env[key])) problems.push(key);
  }
  if (problems.length) throw new Error(`Thiếu hoặc sai biến môi trường: ${problems.join(", ")}`);
}

module.exports = { env, assertEnv };

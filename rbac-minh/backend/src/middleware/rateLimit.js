const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");

/**
 * Phần mở rộng: giới hạn số lần đăng nhập SAI theo cặp (IP, email) để chống dò mật khẩu.
 * Lưu trong bộ nhớ: đủ cho một instance; nhiều instance thì cần Redis.
 */
const failures = new Map();

const keyOf = (req) => `${req.ip}|${String(req.body?.email || "").trim().toLowerCase()}`;

function currentEntry(key) {
  const entry = failures.get(key);
  if (entry && entry.resetAt <= Date.now()) {
    failures.delete(key);
    return null;
  }
  return entry;
}

function loginRateLimit(req, res, next) {
  const entry = currentEntry(keyOf(req));
  if (entry && entry.count >= env.loginMaxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - Date.now()) / 1000);
    throw new AppError(429, "TOO_MANY_ATTEMPTS", `Bạn đã nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(retryAfter / 60)} phút.`, [], {
      "Retry-After": String(retryAfter),
    });
  }
  next();
}

function recordLoginFailure(req) {
  const key = keyOf(req);
  const entry = currentEntry(key) || { count: 0, resetAt: Date.now() + env.loginWindowMs };
  entry.count += 1;
  failures.set(key, entry);
}

const clearLoginFailures = (req) => failures.delete(keyOf(req));

// Dọn các mục hết hạn định kỳ để Map không phình to.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key);
}, 60 * 1000).unref();

module.exports = { loginRateLimit, recordLoginFailure, clearLoginFailures };

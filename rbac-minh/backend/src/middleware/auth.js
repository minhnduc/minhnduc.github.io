const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("../models/Role"); // đăng ký model để populate("roles") hoạt động
const { env } = require("../config/env");
const { AppError } = require("../utils/AppError");
const { isObjectId } = require("../utils/validators");

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

/**
 * Xác thực: "bạn là ai?".
 * Token chỉ chứa sub (userId) và ver (tokenVersion). Quyền KHÔNG nằm trong token mà
 * được tính lại từ DB ở mỗi request → gỡ vai trò / khóa tài khoản có hiệu lực ngay.
 * Mọi lỗi ở đây đều là 401.
 */
async function authenticate(req, res, next) {
  const header = req.get("Authorization");
  if (!header) throw new AppError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập. Thiếu header Authorization: Bearer <token>.");

  const match = header.match(BEARER);
  if (!match) throw new AppError(401, "INVALID_TOKEN", "Header Authorization không đúng định dạng Bearer <token>.");

  let payload;
  try {
    payload = jwt.verify(match[1], env.jwtSecret, { algorithms: ["HS256"] });
  } catch (err) {
    if (err.name === "TokenExpiredError") throw new AppError(401, "TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    throw new AppError(401, "INVALID_TOKEN", "Access token không hợp lệ.");
  }
  if (!isObjectId(payload.sub)) throw new AppError(401, "INVALID_TOKEN", "Access token không hợp lệ.");

  const user = await User.findById(payload.sub).select("+tokenVersion").populate("roles");
  if (!user || user.status !== "active" || (payload.ver ?? 0) !== user.tokenVersion) {
    throw new AppError(401, "INVALID_TOKEN", "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.");
  }

  req.user = user;
  req.permissions = new Set(user.roles.filter(Boolean).flatMap((role) => role.permissions));
  next();
}

/**
 * Phân quyền: "bạn có được làm việc này không?".
 * Đã đăng nhập nhưng thiếu quyền → 403 FORBIDDEN.
 * Header tự khai như X-User-Role bị bỏ qua hoàn toàn: chỉ tin req.permissions từ DB.
 */
function requirePermission(...required) {
  return (req, res, next) => {
    const missing = required.filter((code) => !req.permissions?.has(code));
    if (missing.length) {
      throw new AppError(403, "FORBIDDEN", `Bạn không có quyền thực hiện thao tác này (thiếu: ${missing.join(", ")}).`);
    }
    next();
  };
}

module.exports = { authenticate, requirePermission };

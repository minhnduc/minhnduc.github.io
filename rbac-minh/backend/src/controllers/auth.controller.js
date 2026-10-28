const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { env } = require("../config/env");
const { AppError, issue } = require("../utils/AppError");
const { toUser } = require("../utils/serializers");
const v = require("../utils/validators");
const { recordLoginFailure, clearLoginFailures } = require("../middleware/rateLimit");
const { audit, userTarget } = require("../services/audit");

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

const signAccessToken = (user) => jwt.sign(
  { sub: String(user._id), ver: user.tokenVersion ?? 0 },
  env.jwtSecret,
  { algorithm: "HS256", expiresIn: env.tokenTtl }
);

async function generateRefreshToken(userId, req) {
  const token = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 ngày
  await RefreshToken.create({
    token,
    user: userId,
    expiresAt,
    ip: req.ip,
    userAgent: req.get("User-Agent") || null,
  });
  return token;
}

/** POST /auth/tokens: Đăng nhập cấp accessToken + refreshToken */
async function login(req, res) {
  v.assertJsonObject(req.body);
  const { grantType, email, password } = req.body;
  const details = [];
  if (grantType !== "password") details.push(issue("grantType", "UNSUPPORTED_GRANT_TYPE", "grantType phải là 'password'."));
  if (typeof email !== "string" || !email.trim()) details.push(issue("email", "REQUIRED", "Email là bắt buộc."));
  if (typeof password !== "string" || !password) details.push(issue("password", "REQUIRED", "Mật khẩu là bắt buộc."));
  v.throwIfInvalid(details);

  const user = await User.findOne({ email: email.trim().toLowerCase(), status: { $ne: "deleted" } })
    .select("+passwordHash +tokenVersion");
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk) {
    recordLoginFailure(req);
    throw new AppError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
  }
  if (user.status === "locked") {
    throw new AppError(403, "ACCOUNT_LOCKED", "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.");
  }

  clearLoginFailures(req);
  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = signAccessToken(user);
  const refreshToken = await generateRefreshToken(user._id, req);

  res.set("Cache-Control", "no-store");
  res.json({
    tokenType: "Bearer",
    accessToken,
    expiresIn: env.tokenTtl,
    refreshToken,
  });
}

/** POST /auth/refresh: Cấp accessToken mới bằng refreshToken (Mở rộng) */
async function refreshTokens(req, res) {
  v.assertJsonObject(req.body);
  const { refreshToken } = req.body;
  if (!refreshToken || typeof refreshToken !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "refreshToken là bắt buộc.", [
      issue("refreshToken", "REQUIRED", "refreshToken là bắt buộc."),
    ]);
  }

  const tokenDoc = await RefreshToken.findOne({ token: refreshToken, revokedAt: null });
  if (!tokenDoc || tokenDoc.expiresAt <= new Date()) {
    throw new AppError(401, "INVALID_TOKEN", "Refresh token không hợp lệ hoặc đã hết hạn.");
  }

  const user = await User.findById(tokenDoc.user).select("+tokenVersion");
  if (!user || user.status !== "active") {
    throw new AppError(401, "INVALID_TOKEN", "Tài khoản không còn hiệu lực.");
  }

  // Thu hồi token cũ và sinh refresh token mới (Refresh token rotation)
  tokenDoc.revokedAt = new Date();
  await tokenDoc.save();

  const newAccessToken = signAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user._id, req);

  res.set("Cache-Control", "no-store");
  res.json({
    tokenType: "Bearer",
    accessToken: newAccessToken,
    expiresIn: env.tokenTtl,
    refreshToken: newRefreshToken,
  });
}

/** POST /auth/logout: Đăng xuất phía server - thu hồi refresh token (Mở rộng) */
async function logout(req, res) {
  const { refreshToken } = req.body || {};
  if (refreshToken && typeof refreshToken === "string") {
    await RefreshToken.updateOne({ token: refreshToken }, { revokedAt: new Date() });
  }
  if (req.user) {
    await audit(req, "auth.logout", userTarget(req.user));
  }
  res.status(204).end();
}

/** GET /me: Xem thông tin tài khoản đang đăng nhập */
function me(req, res) {
  res.set("Cache-Control", "no-store");
  res.json({ ...toUser(req.user), permissions: [...req.permissions].sort() });
}

/** PATCH /me (Mở rộng) */
async function updateMe(req, res) {
  v.assertJsonObject(req.body);
  const details = [];
  v.collectUnknownFields(req.body, ["fullName", "phone"], details);
  v.checkText(req.body, "fullName", { label: "Họ tên", min: 2, max: 100 }, details);
  v.checkText(req.body, "phone", { label: "Số điện thoại", nullable: true, pattern: v.PATTERNS.phone, patternMessage: "Số điện thoại phải theo định dạng E.164, ví dụ +84912345678." }, details);
  v.throwIfInvalid(details);

  if (v.has(req.body, "fullName")) req.user.fullName = req.body.fullName.trim();
  if (v.has(req.body, "phone")) req.user.phone = req.body.phone?.trim() || null;
  await req.user.save();
  await audit(req, "me.update", userTarget(req.user), { fields: Object.keys(req.body) });
  res.json({ ...toUser(req.user), permissions: [...req.permissions].sort() });
}

/** PUT /me/password (Mở rộng) */
async function changePassword(req, res) {
  v.assertJsonObject(req.body);
  const { currentPassword, newPassword } = req.body;
  const details = [];
  v.collectUnknownFields(req.body, ["currentPassword", "newPassword"], details);
  if (typeof currentPassword !== "string" || !currentPassword) details.push(issue("currentPassword", "REQUIRED", "Vui lòng nhập mật khẩu hiện tại."));
  const weak = v.passwordIssue(newPassword, "newPassword");
  if (weak) details.push(weak);
  if (!weak && newPassword === currentPassword) details.push(issue("newPassword", "SAME_AS_CURRENT", "Mật khẩu mới phải khác mật khẩu hiện tại."));
  v.throwIfInvalid(details);

  const user = await User.findById(req.user._id).select("+passwordHash +tokenVersion");
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, "VALIDATION_ERROR", "Dữ liệu đầu vào không hợp lệ.", [issue("currentPassword", "INCORRECT", "Mật khẩu hiện tại không đúng.")]);
  }
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  // Thu hồi mọi refresh token hiện có của user
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit(req, "me.password_change", userTarget(user));

  const accessToken = signAccessToken(user);
  const refreshToken = await generateRefreshToken(user._id, req);

  res.set("Cache-Control", "no-store");
  res.json({
    tokenType: "Bearer",
    accessToken,
    expiresIn: env.tokenTtl,
    refreshToken,
  });
}

module.exports = { login, refreshTokens, logout, me, updateMe, changePassword };

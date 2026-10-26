const Role = require("../models/Role");
const User = require("../models/User");
const { AppError } = require("../utils/AppError");
const { SUPER_ADMIN } = require("../config/rbac");

/** Các quyền trong `codes` mà người thao tác không có. */
const missingFrom = (codes, myPermissions) => [...new Set(codes)].filter((code) => !myPermissions.has(code));

/**
 * Chống leo thang đặc quyền: chỉ được gán / gỡ / cấp những gì mình đang có.
 * Nếu không, user-manager có thể tự tạo một tài khoản super-admin.
 */
function assertNoEscalation(codes, myPermissions, message) {
  const missing = missingFrom(codes, myPermissions);
  if (missing.length) {
    throw new AppError(403, "PRIVILEGE_ESCALATION", `${message} (vượt quyền: ${missing.join(", ")}).`);
  }
}

const isSelf = (req, target) => String(req.user._id) === String(target._id);

function assertNotSelf(req, target, message) {
  if (isSelf(req, target)) throw new AppError(403, "SELF_ACTION_FORBIDDEN", message);
}

/**
 * BR: hệ thống luôn phải còn ít nhất một super-admin đang hoạt động.
 * Gọi trước khi khóa / xóa user hoặc gỡ vai trò super-admin của user.
 * Phải chạy bên trong exclusive() để hai request song song không cùng vượt qua.
 */
async function assertNotLastSuperAdmin(target) {
  if (target.status !== "active") return;
  const superAdmin = await Role.findOne({ code: SUPER_ADMIN }).select("_id").lean();
  if (!superAdmin) return;
  const targetIsSuperAdmin = target.roles.some((role) => String(role._id ?? role) === String(superAdmin._id));
  if (!targetIsSuperAdmin) return;
  const others = await User.countDocuments({ _id: { $ne: target._id }, status: "active", roles: superAdmin._id });
  if (others === 0) {
    throw new AppError(409, "LAST_SUPER_ADMIN", "Không thể thực hiện: hệ thống phải còn ít nhất một super-admin đang hoạt động.");
  }
}

module.exports = { missingFrom, assertNoEscalation, isSelf, assertNotSelf, assertNotLastSuperAdmin };

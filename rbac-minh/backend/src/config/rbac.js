/**
 * Danh mục quyền và vai trò hệ thống: nguồn dữ liệu duy nhất cho seed và cho code.
 */
const PERMISSIONS = [
  ["users:read", "Xem danh sách và chi tiết người dùng"],
  ["users:create", "Tạo người dùng mới"],
  ["users:update", "Sửa thông tin, khóa / mở khóa người dùng"],
  ["users:delete", "Xóa (mềm) người dùng"],
  ["roles:read", "Xem vai trò và quyền của vai trò"],
  ["roles:create", "Tạo vai trò mới"],
  ["roles:update", "Sửa vai trò, thay bộ quyền của vai trò"],
  ["roles:delete", "Xóa vai trò"],
  ["roles:assign", "Gán / gỡ vai trò cho người dùng"],
  ["permissions:read", "Xem danh mục quyền"],
  ["audit-logs:read", "Xem nhật ký kiểm toán (mở rộng)"],
].map(([code, description]) => {
  const [resource, action] = code.split(":");
  return { code, resource, action, description };
});

const ALL = PERMISSIONS.map((permission) => permission.code);

const SYSTEM_ROLES = [
  { code: "super-admin", name: "Quản trị viên hệ thống", description: "Toàn quyền trên hệ thống", permissions: ALL },
  {
    code: "user-manager", name: "Quản lý người dùng", description: "Quản lý tài khoản và gán vai trò, không được xóa",
    permissions: ["users:read", "users:create", "users:update", "roles:read", "roles:assign", "permissions:read"],
  },
  {
    code: "auditor", name: "Kiểm toán viên", description: "Chỉ xem, phục vụ kiểm tra",
    permissions: ["users:read", "roles:read", "permissions:read", "audit-logs:read"],
  },
  { code: "member", name: "Thành viên", description: "Vai trò mặc định, không có quyền quản trị", permissions: [] },
].map((role) => ({ ...role, isSystem: true }));

const SUPER_ADMIN = "super-admin";
const DEFAULT_ROLE = "member";

module.exports = { PERMISSIONS, SYSTEM_ROLES, SUPER_ADMIN, DEFAULT_ROLE };

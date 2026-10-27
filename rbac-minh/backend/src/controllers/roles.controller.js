const Role = require("../models/Role");
const User = require("../models/User");
const Permission = require("../models/Permission");
const { AppError, issue } = require("../utils/AppError");
const { toRole, toPermission, toUser } = require("../utils/serializers");
const { parseListQuery, assertQuery, escapeRegex, pageMeta } = require("../utils/listQuery");
const { exclusive } = require("../utils/mutex");
const v = require("../utils/validators");
const guards = require("../services/guards");
const { audit, roleTarget } = require("../services/audit");

const SORTABLE = ["name", "code", "createdAt"];
const CREATE_FIELDS = ["code", "name", "description", "permissions"];
const UPDATE_FIELDS = ["name", "description"];

async function countUsersWithRole(roleId) {
  return User.countDocuments({ roles: roleId, status: { $ne: "deleted" } });
}

async function checkPermissionCodes(permissions) {
  if (!Array.isArray(permissions) || !permissions.every((p) => typeof p === "string")) {
    return { code: "VALIDATION_ERROR", details: [issue("permissions", "INVALID_TYPE", "permissions phải là mảng chuỗi mã quyền.")] };
  }
  const uniqueCodes = [...new Set(permissions)];
  const existing = await Permission.find({ code: { $in: uniqueCodes } }).select("code").lean();
  const existingCodes = new Set(existing.map((p) => p.code));
  const unknown = uniqueCodes.filter((code) => !existingCodes.has(code));
  if (unknown.length) {
    return {
      code: "PERMISSION_NOT_FOUND",
      details: unknown.map((code) => issue("permissions", "NOT_FOUND", `Quyền '${code}' không tồn tại trong danh mục.`)),
    };
  }
  return null;
}

/** GET /roles */
async function listRoles(req, res) {
  const { page, limit, skip, sort, q, details } = parseListQuery(req.query, { sortable: SORTABLE, defaultSort: "name" });
  assertQuery(details);

  const filter = {};
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: pattern }, { code: pattern }, { description: pattern }];
  }

  const [roles, totalItems] = await Promise.all([
    Role.find(filter).sort(sort).skip(skip).limit(limit),
    Role.countDocuments(filter),
  ]);

  const userCounts = await Promise.all(roles.map((r) => countUsersWithRole(r._id)));
  const data = roles.map((r, i) => toRole(r, userCounts[i]));

  res.json({ data, meta: pageMeta(page, limit, totalItems) });
}

/** GET /roles/:roleId */
async function getRole(req, res) {
  const userCount = await countUsersWithRole(req.role._id);
  res.json(toRole(req.role, userCount));
}

/** POST /roles */
async function createRole(req, res) {
  const body = req.body;
  v.assertJsonObject(body);
  const details = [];
  v.collectUnknownFields(body, CREATE_FIELDS, details);
  v.checkText(body, "code", { label: "Mã vai trò", required: true, pattern: v.PATTERNS.roleCode, patternMessage: "Mã vai trò phải có 3–50 ký tự chữ thường, số, gạch nối và bắt đầu bằng chữ." }, details);
  v.checkText(body, "name", { label: "Tên vai trò", required: true, min: 2, max: 100 }, details);
  v.checkText(body, "description", { label: "Mô tả", nullable: true, max: 500 }, details);
  v.throwIfInvalid(details);

  const permissions = body.permissions === undefined ? [] : body.permissions;
  const permError = await checkPermissionCodes(permissions);
  if (permError) {
    throw new AppError(400, permError.code, "Danh sách quyền không hợp lệ.", permError.details);
  }

  guards.assertNoEscalation(permissions, req.permissions, "Không thể cấp quyền mà bạn không sở hữu");

  const code = body.code.trim();
  if (await Role.exists({ code })) {
    throw new AppError(409, "ROLE_CODE_EXISTS", "Mã vai trò đã tồn tại.", [issue("code", "DUPLICATE", "Mã vai trò đã tồn tại.")]);
  }

  const role = await Role.create({
    code,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    isSystem: false,
    permissions: [...new Set(permissions)],
  });

  await audit(req, "role.create", roleTarget(role), { permissions: role.permissions });
  res.status(201).location(`${req.baseUrl}/${role._id}`).json(toRole(role, 0));
}

/** PATCH /roles/:roleId */
async function updateRole(req, res) {
  const body = req.body;
  v.assertJsonObject(body);
  const details = [];
  v.collectUnknownFields(body, UPDATE_FIELDS, details);
  v.checkText(body, "name", { label: "Tên vai trò", min: 2, max: 100 }, details);
  v.checkText(body, "description", { label: "Mô tả", nullable: true, max: 500 }, details);
  if (!Object.keys(body).length) details.push(issue("body", "EMPTY", "Cần gửi ít nhất một trường để cập nhật."));
  v.throwIfInvalid(details);

  if (v.has(body, "name")) req.role.name = body.name.trim();
  if (v.has(body, "description")) req.role.description = body.description?.trim() || null;
  await req.role.save();

  await audit(req, "role.update", roleTarget(req.role), { fields: Object.keys(body) });
  const userCount = await countUsersWithRole(req.role._id);
  res.json(toRole(req.role, userCount));
}

/** DELETE /roles/:roleId */
async function deleteRole(req, res) {
  await exclusive(async () => {
    if (req.role.isSystem) {
      throw new AppError(409, "SYSTEM_ROLE_PROTECTED", "Không thể xóa vai trò hệ thống.");
    }
    const userCount = await countUsersWithRole(req.role._id);
    if (userCount > 0) {
      throw new AppError(409, "ROLE_IN_USE", `Vai trò đang được gán cho ${userCount} người dùng, không thể xóa.`);
    }
    await req.role.deleteOne();
    await audit(req, "role.delete", roleTarget(req.role));
  });
  res.status(204).end();
}

/** GET /roles/:roleId/permissions */
async function getRolePermissions(req, res) {
  const permissions = await Permission.find({ code: { $in: req.role.permissions } }).sort({ resource: 1, code: 1 });
  res.json({ data: permissions.map(toPermission), meta: { totalItems: permissions.length } });
}

/** PUT /roles/:roleId/permissions */
async function updateRolePermissions(req, res) {
  const body = req.body;
  v.assertJsonObject(body);
  const details = [];
  v.collectUnknownFields(body, ["permissions"], details);
  if (!v.has(body, "permissions") || !Array.isArray(body.permissions)) {
    details.push(issue("permissions", "REQUIRED", "permissions phải là một mảng mã quyền."));
  }
  v.throwIfInvalid(details);

  if (req.role.isSystem) {
    throw new AppError(409, "SYSTEM_ROLE_PROTECTED", "Không thể sửa bộ quyền của vai trò hệ thống.");
  }

  const permError = await checkPermissionCodes(body.permissions);
  if (permError) {
    throw new AppError(400, permError.code, "Danh sách quyền không hợp lệ.", permError.details);
  }

  const nextPermissions = [...new Set(body.permissions)];
  // Kiểm tra quyền thêm/gỡ so với quyền của chính actor
  const diff = [...new Set([...req.role.permissions, ...nextPermissions])].filter(
    (code) => req.role.permissions.includes(code) !== nextPermissions.includes(code)
  );
  guards.assertNoEscalation(diff, req.permissions, "Không thể thêm hoặc gỡ các quyền mà bạn không sở hữu");

  req.role.permissions = nextPermissions;
  await req.role.save();

  await audit(req, "role.permissions_update", roleTarget(req.role), { count: nextPermissions.length });
  const userCount = await countUsersWithRole(req.role._id);
  res.json(toRole(req.role, userCount));
}

/** GET /roles/:roleId/users (Mở rộng: Xem danh sách người dùng được gán vai trò này) */
async function getRoleUsers(req, res) {
  const { page, limit, skip, details } = parseListQuery(req.query, { sortable: ["fullName", "email", "createdAt"], defaultSort: "fullName" });
  assertQuery(details);

  const filter = { roles: req.role._id, status: { $ne: "deleted" } };
  const [users, totalItems] = await Promise.all([
    User.find(filter).sort({ fullName: 1, _id: 1 }).skip(skip).limit(limit).populate("roles"),
    User.countDocuments(filter),
  ]);

  res.json({ data: users.map(toUser), meta: pageMeta(page, limit, totalItems) });
}

module.exports = {
  listRoles, getRole, createRole, updateRole, deleteRole,
  getRolePermissions, updateRolePermissions, getRoleUsers,
};

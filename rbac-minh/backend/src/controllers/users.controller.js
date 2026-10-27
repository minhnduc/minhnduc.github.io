const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Role = require("../models/Role");
const { DEFAULT_ROLE } = require("../config/rbac");
const { AppError, issue } = require("../utils/AppError");
const { toUser, toRoleRef } = require("../utils/serializers");
const { parseListQuery, assertQuery, escapeRegex, pageMeta } = require("../utils/listQuery");
const { exclusive } = require("../utils/mutex");
const v = require("../utils/validators");
const guards = require("../services/guards");
const { audit, userTarget } = require("../services/audit");

const SORTABLE = ["fullName", "email", "createdAt", "lastLoginAt", "status"];
const CREATE_FIELDS = ["email", "fullName", "phone", "password", "roleIds"];
const UPDATE_FIELDS = ["email", "fullName", "phone", "status"];

const EMAIL_RULE = { label: "Email", max: 254, pattern: v.PATTERNS.email, patternMessage: "Email không đúng định dạng." };
const NAME_RULE = { label: "Họ tên", min: 2, max: 100 };
const PHONE_RULE = { label: "Số điện thoại", nullable: true, pattern: v.PATTERNS.phone, patternMessage: "Số điện thoại phải theo định dạng E.164, ví dụ +84912345678." };

const emailConflict = () => new AppError(409, "EMAIL_ALREADY_EXISTS", "Email đã được sử dụng.", [issue("email", "DUPLICATE", "Email đã được sử dụng.")]);
const permissionsOf = (roles) => roles.filter(Boolean).flatMap((role) => role.permissions);

/** Middleware: nạp user theo :userId (bỏ qua user đã xóa mềm) vào req.target. */
async function loadTargetUser(req, res, next) {
  const { userId } = req.params;
  const user = v.isObjectId(userId)
    ? await User.findOne({ _id: userId, status: { $ne: "deleted" } }).populate("roles")
    : null;
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "Không tìm thấy người dùng.");
  req.target = user;
  next();
}

/** Middleware: nạp role theo :roleId vào req.role. */
async function loadTargetRole(req, res, next) {
  const { roleId } = req.params;
  const role = v.isObjectId(roleId) ? await Role.findById(roleId) : null;
  if (!role) throw new AppError(404, "ROLE_NOT_FOUND", "Không tìm thấy vai trò.");
  req.role = role;
  next();
}

/**
 * Không cho thao tác lên người có quyền cao hơn mình
 * (vd. user-manager khóa super-admin → bị chặn).
 */
function assertCanManage(req, target) {
  guards.assertNoEscalation(permissionsOf(target.roles), req.permissions, "Không thể thao tác lên người dùng có quyền cao hơn bạn");
}

/** GET /users */
async function listUsers(req, res) {
  const { page, limit, skip, sort, q, details } = parseListQuery(req.query, { sortable: SORTABLE, defaultSort: "-createdAt" });
  const { status, roleId } = req.query;
  if (status !== undefined && !["active", "locked"].includes(status)) {
    details.push(issue("status", "INVALID_VALUE", "status chỉ nhận active hoặc locked."));
  }
  if (roleId !== undefined && !v.isObjectId(roleId)) details.push(issue("roleId", "INVALID_VALUE", "roleId phải là ObjectId hợp lệ."));
  assertQuery(details);

  const filter = { status: status ?? { $ne: "deleted" } };
  if (roleId) filter.roles = roleId;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ fullName: pattern }, { email: pattern }, { phone: pattern }];
  }

  const [users, totalItems] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit).populate("roles"),
    User.countDocuments(filter),
  ]);
  res.json({ data: users.map(toUser), meta: pageMeta(page, limit, totalItems) });
}

/** GET /users/:userId */
function getUser(req, res) {
  res.json(toUser(req.target));
}

/** POST /users */
async function createUser(req, res) {
  const body = req.body;
  v.assertJsonObject(body);
  const details = [];
  v.collectUnknownFields(body, CREATE_FIELDS, details);
  v.checkText(body, "email", { ...EMAIL_RULE, required: true }, details);
  v.checkText(body, "fullName", { ...NAME_RULE, required: true }, details);
  v.checkText(body, "phone", PHONE_RULE, details);
  const weak = v.passwordIssue(body.password);
  if (weak) details.push(weak);
  const hasRoleIds = v.has(body, "roleIds");
  if (hasRoleIds && (!Array.isArray(body.roleIds) || body.roleIds.length > 20 || !body.roleIds.every(v.isObjectId))) {
    details.push(issue("roleIds", "INVALID_VALUE", "roleIds phải là mảng (tối đa 20) ObjectId hợp lệ."));
  }
  v.throwIfInvalid(details);

  // Tự chọn vai trò khi tạo = một hành động gán vai trò → cần thêm roles:assign.
  if (hasRoleIds && body.roleIds.length && !req.permissions.has("roles:assign")) {
    throw new AppError(403, "FORBIDDEN", "Chọn vai trò khi tạo người dùng cần quyền roles:assign.");
  }

  const roleIds = [...new Set((hasRoleIds ? body.roleIds : []).map((id) => id.toLowerCase()))];
  const roles = roleIds.length ? await Role.find({ _id: { $in: roleIds } }) : await Role.find({ code: DEFAULT_ROLE });
  if (roleIds.length && roles.length !== roleIds.length) {
    const found = new Set(roles.map((role) => String(role._id)));
    throw new AppError(400, "ROLE_NOT_FOUND", "Có vai trò không tồn tại.", roleIds.filter((id) => !found.has(id))
      .map((id) => issue("roleIds", "NOT_FOUND", `Không tìm thấy vai trò ${id}.`)));
  }
  if (!roles.length) throw new Error(`Chưa seed vai trò mặc định '${DEFAULT_ROLE}'.`);
  guards.assertNoEscalation(permissionsOf(roles), req.permissions, "Không thể gán vai trò có quyền vượt quá quyền của bạn");

  const email = body.email.trim().toLowerCase();
  if (await User.exists({ email })) throw emailConflict(); // gồm cả user đã xóa mềm

  const user = await User.create({
    email,
    fullName: body.fullName.trim(),
    phone: body.phone?.trim() || null,
    passwordHash: await bcrypt.hash(body.password, 10),
    roles: roles.map((role) => role._id),
  });
  await user.populate("roles");
  await audit(req, "user.create", userTarget(user), { roles: roles.map((role) => role.code) });

  res.status(201).location(`${req.baseUrl}/${user._id}`).json(toUser(user));
}

/** PATCH /users/:userId: cập nhật một phần, chỉ các trường gửi lên. */
async function updateUser(req, res) {
  const body = req.body;
  v.assertJsonObject(body);
  const details = [];
  v.collectUnknownFields(body, UPDATE_FIELDS, details);
  v.checkText(body, "email", EMAIL_RULE, details);
  v.checkText(body, "fullName", NAME_RULE, details);
  v.checkText(body, "phone", PHONE_RULE, details);
  if (v.has(body, "status") && !["active", "locked"].includes(body.status)) {
    details.push(issue("status", "INVALID_VALUE", "status chỉ nhận active hoặc locked."));
  }
  if (!Object.keys(body).length) details.push(issue("body", "EMPTY", "Cần gửi ít nhất một trường để cập nhật."));
  v.throwIfInvalid(details);

  await exclusive(async () => {
    const target = req.target;
    const locking = body.status === "locked" && target.status !== "locked";
    if (locking) guards.assertNotSelf(req, target, "Bạn không thể tự khóa tài khoản của mình.");
    if (!guards.isSelf(req, target)) assertCanManage(req, target);
    if (locking) await guards.assertNotLastSuperAdmin(target);

    const changes = {};
    if (v.has(body, "email")) {
      const email = body.email.trim().toLowerCase();
      if (email !== target.email && await User.exists({ email, _id: { $ne: target._id } })) throw emailConflict();
      changes.email = email;
    }
    if (v.has(body, "fullName")) changes.fullName = body.fullName.trim();
    if (v.has(body, "phone")) changes.phone = body.phone?.trim() || null;
    if (v.has(body, "status")) changes.status = body.status;

    target.set(changes);
    await target.save();
    const action = locking ? "user.lock" : (body.status === "active" ? "user.unlock" : "user.update");
    await audit(req, action, userTarget(target), { fields: Object.keys(changes) });
  });

  res.json(toUser(req.target));
}

/** DELETE /users/:userId: xóa mềm. */
async function deleteUser(req, res) {
  await exclusive(async () => {
    const target = req.target;
    guards.assertNotSelf(req, target, "Bạn không thể tự xóa tài khoản của mình.");
    assertCanManage(req, target);
    await guards.assertNotLastSuperAdmin(target);
    target.status = "deleted";
    target.deletedAt = new Date();
    await target.save();
    await audit(req, "user.delete", userTarget(target));
  });
  res.status(204).end();
}

/** GET /users/:userId/roles */
function listUserRoles(req, res) {
  const data = req.target.roles.filter(Boolean).map(toRoleRef);
  res.json({ data, meta: { totalItems: data.length } });
}

/** PUT /users/:userId/roles/:roleId: idempotent, gán lần hai vẫn 204, không trùng. */
async function assignRole(req, res) {
  guards.assertNoEscalation(req.role.permissions, req.permissions, "Không thể gán vai trò có quyền vượt quá quyền của bạn");
  const result = await User.updateOne({ _id: req.target._id, status: { $ne: "deleted" } }, { $addToSet: { roles: req.role._id } });
  if (result.modifiedCount) {
    await audit(req, "role.assign", userTarget(req.target), { role: req.role.code });
  }
  res.status(204).end();
}

/** DELETE /users/:userId/roles/:roleId: idempotent, gỡ role chưa có vẫn 204. */
async function revokeRole(req, res) {
  await exclusive(async () => {
    guards.assertNotSelf(req, req.target, "Bạn không thể tự gỡ vai trò của chính mình.");
    guards.assertNoEscalation(req.role.permissions, req.permissions, "Không thể gỡ vai trò có quyền vượt quá quyền của bạn");
    const hasRole = req.target.roles.some((role) => String(role._id) === String(req.role._id));
    if (!hasRole) return;
    await guards.assertNotLastSuperAdmin({ ...req.target.toObject(), roles: [req.role] });
    await User.updateOne({ _id: req.target._id }, { $pull: { roles: req.role._id } });
    await audit(req, "role.revoke", userTarget(req.target), { role: req.role.code });
  });
  res.status(204).end();
}

/** GET /users/:userId/permissions (Mở rộng: Quyền hiệu lực và nguồn gốc từng vai trò) */
async function getUserEffectivePermissions(req, res) {
  const target = req.target;
  const roles = target.roles.filter(Boolean);
  const permissionMap = new Map();

  for (const role of roles) {
    for (const code of role.permissions || []) {
      if (!permissionMap.has(code)) {
        permissionMap.set(code, { code, grantedByRoles: [] });
      }
      permissionMap.get(code).grantedByRoles.push({ id: String(role._id), code: role.code, name: role.name });
    }
  }

  const allPermDocs = await Permission.find({ code: { $in: Array.from(permissionMap.keys()) } }).lean();
  const docMap = new Map(allPermDocs.map((p) => [p.code, p]));

  const data = Array.from(permissionMap.values()).map((item) => {
    const doc = docMap.get(item.code);
    return {
      code: item.code,
      resource: doc?.resource || item.code.split(":")[0],
      action: doc?.action || item.code.split(":")[1],
      description: doc?.description || "",
      grantedByRoles: item.grantedByRoles,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));

  res.json({
    data,
    meta: {
      userId: String(target._id),
      userEmail: target.email,
      totalPermissions: data.length,
    },
  });
}

module.exports = {
  loadTargetUser, loadTargetRole,
  listUsers, getUser, createUser, updateUser, deleteUser,
  listUserRoles, assignRole, revokeRole,
  getUserEffectivePermissions,
};


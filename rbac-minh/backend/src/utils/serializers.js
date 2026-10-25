/**
 * Chuyển document Mongoose thành JSON trả cho client.
 * Chỉ liệt kê trường được phép, nên passwordHash không bao giờ lọt ra ngoài.
 */
const id = (doc) => String(doc._id);

const toRoleRef = (role) => ({ id: id(role), code: role.code, name: role.name });

function toUser(user) {
  return {
    id: id(user),
    email: user.email,
    fullName: user.fullName,
    phone: user.phone ?? null,
    status: user.status,
    roles: (user.roles || []).filter((role) => role && role.code).map(toRoleRef),
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toRole(role, userCount = 0) {
  return {
    id: id(role),
    code: role.code,
    name: role.name,
    description: role.description ?? null,
    isSystem: Boolean(role.isSystem),
    permissions: [...(role.permissions || [])].sort(),
    permissionCount: (role.permissions || []).length,
    userCount,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

const toPermission = (permission) => ({
  code: permission.code,
  resource: permission.resource,
  action: permission.action,
  description: permission.description,
});

const toAuditLog = (log) => ({
  id: id(log),
  action: log.action,
  actor: log.actor ? { id: String(log.actor._id ?? log.actor), email: log.actorEmail } : null,
  target: log.targetType ? { type: log.targetType, id: log.targetId, label: log.targetLabel } : null,
  metadata: log.metadata ?? {},
  ip: log.ip ?? null,
  createdAt: log.createdAt,
});

module.exports = { toRoleRef, toUser, toRole, toPermission, toAuditLog };

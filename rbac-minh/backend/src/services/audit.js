const AuditLog = require("../models/AuditLog");

/**
 * Ghi nhật ký kiểm toán. Không bao giờ làm hỏng request chính:
 * nếu ghi log lỗi thì chỉ in ra console.
 */
async function audit(req, action, target = null, metadata = {}) {
  try {
    await AuditLog.create({
      action,
      actor: req.user?._id ?? null,
      actorEmail: req.user?.email ?? null,
      targetType: target?.type ?? null,
      targetId: target?.id ? String(target.id) : null,
      targetLabel: target?.label ?? null,
      metadata,
      ip: req.ip,
    });
  } catch (err) {
    console.error("Không ghi được audit log:", err.message);
  }
}

const userTarget = (user) => ({ type: "user", id: user._id, label: user.email });
const roleTarget = (role) => ({ type: "role", id: role._id, label: role.code });

module.exports = { audit, userTarget, roleTarget };

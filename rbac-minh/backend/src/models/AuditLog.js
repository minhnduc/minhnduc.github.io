const mongoose = require("mongoose");

/** Phần mở rộng: nhật ký kiểm toán, ghi lại các thao tác thay đổi dữ liệu RBAC. */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true }, // vd. "user.create", "role.assign"
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, default: null },
    targetType: { type: String, enum: ["user", "role", null], default: null },
    targetId: { type: String, default: null },
    targetLabel: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);

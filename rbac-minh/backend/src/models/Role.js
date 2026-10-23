const mongoose = require("mongoose");
const { PATTERNS } = require("../utils/validators");

const roleSchema = new mongoose.Schema(
  {
    // Mã vai trò là định danh ổn định dùng trong code (vd. "super-admin"), không cho đổi sau khi tạo.
    code: { type: String, required: true, unique: true, trim: true, immutable: true, match: PATTERNS.roleCode },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, default: null, maxlength: 500 },
    // Vai trò hệ thống: không xóa được, không thay bộ quyền được (BR-05).
    isSystem: { type: Boolean, default: false, immutable: true },
    // Lưu mã quyền (chuỗi) thay vì ObjectId: dễ đọc, khớp trực tiếp với requirePermission("users:read").
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

module.exports = mongoose.model("Role", roleSchema);

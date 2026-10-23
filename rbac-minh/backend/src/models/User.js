const mongoose = require("mongoose");
const { PATTERNS } = require("../utils/validators");

const USER_STATUSES = ["active", "locked", "deleted"];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: PATTERNS.email },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    phone: { type: String, default: null, match: PATTERNS.phone },
    // select:false → mọi truy vấn mặc định KHÔNG đọc passwordHash; chỉ lấy khi đăng nhập / đổi mật khẩu.
    passwordHash: { type: String, required: true, select: false },
    // "deleted" = xóa mềm: giữ bản ghi để truy vết, nhưng ẩn khỏi mọi API và không đăng nhập được.
    status: { type: String, enum: USER_STATUSES, default: "active", index: true },
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role", index: true }],
    lastLoginAt: { type: Date, default: null },
    // Tăng mỗi khi đổi mật khẩu → token phát hành trước đó tự mất hiệu lực.
    tokenVersion: { type: Number, default: 0, select: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
module.exports.USER_STATUSES = USER_STATUSES;

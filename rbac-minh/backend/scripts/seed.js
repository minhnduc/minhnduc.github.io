const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Permission = require("../src/models/Permission");
const Role = require("../src/models/Role");
const User = require("../src/models/User");
const AuditLog = require("../src/models/AuditLog");
const RefreshToken = require("../src/models/RefreshToken");
const { PERMISSIONS, SYSTEM_ROLES } = require("../src/config/rbac");
const { env, assertEnv } = require("../src/config/env");

const CUSTOM_ROLES = [
  {
    code: "tro-giang",
    name: "Trợ giảng",
    description: "Hỗ trợ quản lý lớp và xem thông tin người dùng",
    isSystem: false,
    permissions: ["users:read", "roles:read"],
  },
];

const SEED_USERS = [
  // 1. Tài khoản super-admin của sinh viên thực hiện (Đề án IT4409)
  {
    email: process.env.SEED_ADMIN_EMAIL || "minh.nd252092m@sis.hust.edu.vn",
    fullName: process.env.SEED_ADMIN_NAME || "Nguyễn Đức Minh",
    phone: "+84912345678",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin@2026",
    roles: ["super-admin"],
  },
  // 2. Tài khoản dành riêng cho Giảng viên kiểm tra (Mục 1.2 template docx)
  {
    email: "gv.admin@sis.hust.edu.vn",
    fullName: "TS. Trần Văn Giảng (GV Admin)",
    password: process.env.SEED_GV_PASSWORD || "Giangvien@2026",
    roles: ["super-admin"],
  },
  {
    email: "gv.manager@sis.hust.edu.vn",
    fullName: "ThS. Lê Hoàng Nam (GV User Manager)",
    password: process.env.SEED_GV_PASSWORD || "Giangvien@2026",
    roles: ["user-manager"],
  },
  {
    email: "gv.auditor@sis.hust.edu.vn",
    fullName: "ThS. Phạm Thu Trang (GV Auditor)",
    password: process.env.SEED_GV_PASSWORD || "Giangvien@2026",
    roles: ["auditor"],
  },
  {
    email: "gv.member@sis.hust.edu.vn",
    fullName: "Nguyễn Hải Đăng (GV Member)",
    password: process.env.SEED_GV_PASSWORD || "Giangvien@2026",
    roles: ["member"],
  },
  // 3. Tài khoản trợ giảng và nhân sự mẫu
  {
    email: "trogiang@sis.hust.edu.vn",
    fullName: "Đỗ Minh Trí (Trợ Giảng)",
    password: "Member@2026",
    roles: ["member", "tro-giang"],
  },
  {
    email: "thaovp@sis.hust.edu.vn",
    fullName: "Vũ Phương Thảo",
    password: "Member@2026",
    roles: ["member"],
  },
];

async function seed() {
  assertEnv();
  console.log("Đang kết nối MongoDB để khởi tạo seed dữ liệu...");
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });

  if (mongoose.connection.name !== "it4409_rbac") {
    console.warn(`[Cảnh báo] Database hiện tại là '${mongoose.connection.name}' thay vì 'it4409_rbac'.`);
  }

  const counts = await Promise.all([Permission.countDocuments(), Role.countDocuments(), User.countDocuments()]);
  const hasData = counts.some((c) => c > 0);

  if (hasData && !process.argv.includes("--reset")) {
    console.log("Database đã có dữ liệu. Không thay đổi gì. Dùng 'npm run seed:reset' nếu muốn xóa và tạo lại toàn bộ.");
    await mongoose.disconnect();
    return;
  }

  if (process.argv.includes("--reset")) {
    console.log("Đang làm sạch dữ liệu cũ (--reset)...");
    await Promise.all([
      Permission.deleteMany({}),
      Role.deleteMany({}),
      User.deleteMany({}),
      AuditLog.deleteMany({}),
      RefreshToken.deleteMany({}),
    ]);
  }

  console.log(`1. Chèn ${PERMISSIONS.length} danh mục quyền...`);
  await Permission.insertMany(PERMISSIONS);

  console.log("2. Chèn các vai trò hệ thống và tùy chỉnh...");
  const allRoles = [...SYSTEM_ROLES, ...CUSTOM_ROLES];
  const createdRoles = await Role.insertMany(allRoles);
  const roleCodeToId = new Map(createdRoles.map((r) => [r.code, r._id]));

  console.log(`3. Khởi tạo ${SEED_USERS.length} người dùng ban đầu...`);
  for (const item of SEED_USERS) {
    const passwordHash = await bcrypt.hash(item.password, 10);
    const roleIds = item.roles.map((code) => {
      const id = roleCodeToId.get(code);
      if (!id) throw new Error(`Role '${code}' không tìm thấy khi tạo user '${item.email}'.`);
      return id;
    });

    await User.create({
      email: item.email.toLowerCase().trim(),
      fullName: item.fullName.trim(),
      phone: item.phone || null,
      passwordHash,
      roles: roleIds,
      status: "active",
    });
  }

  console.log(">>> KHỞI TẠO DỮ LIỆU SEED THÀNH CÔNG! <<<");
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Lỗi khi chạy seed:", err);
  process.exit(1);
});

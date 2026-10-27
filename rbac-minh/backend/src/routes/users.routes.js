const express = require("express");
const users = require("../controllers/users.controller");
const { authenticate, requirePermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", requirePermission("users:read"), users.listUsers);
router.post("/", requirePermission("users:create"), users.createUser);

router.get("/:userId", requirePermission("users:read"), users.loadTargetUser, users.getUser);
router.patch("/:userId", requirePermission("users:update"), users.loadTargetUser, users.updateUser);
router.delete("/:userId", requirePermission("users:delete"), users.loadTargetUser, users.deleteUser);

// Quản lý vai trò của người dùng
router.get("/:userId/roles", requirePermission("users:read"), users.loadTargetUser, users.listUserRoles);
router.put("/:userId/roles/:roleId", requirePermission("roles:assign"), users.loadTargetUser, users.loadTargetRole, users.assignRole);
router.delete("/:userId/roles/:roleId", requirePermission("roles:assign"), users.loadTargetUser, users.loadTargetRole, users.revokeRole);

// Mở rộng: Quyền hiệu lực và nguồn gốc
router.get("/:userId/permissions", requirePermission("users:read"), users.loadTargetUser, users.getUserEffectivePermissions);

module.exports = router;

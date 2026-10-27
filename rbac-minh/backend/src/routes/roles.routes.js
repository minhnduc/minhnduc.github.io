const express = require("express");
const roles = require("../controllers/roles.controller");
const users = require("../controllers/users.controller");
const { authenticate, requirePermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", requirePermission("roles:read"), roles.listRoles);
router.post("/", requirePermission("roles:create"), roles.createRole);

router.get("/:roleId", requirePermission("roles:read"), users.loadTargetRole, roles.getRole);
router.patch("/:roleId", requirePermission("roles:update"), users.loadTargetRole, roles.updateRole);
router.delete("/:roleId", requirePermission("roles:delete"), users.loadTargetRole, roles.deleteRole);

// Quản lý quyền của vai trò
router.get("/:roleId/permissions", requirePermission("roles:read"), users.loadTargetRole, roles.getRolePermissions);
router.put("/:roleId/permissions", requirePermission("roles:update"), users.loadTargetRole, roles.updateRolePermissions);

// Mở rộng: Danh sách người dùng có vai trò này
router.get("/:roleId/users", requirePermission("roles:read"), users.loadTargetRole, roles.getRoleUsers);

module.exports = router;

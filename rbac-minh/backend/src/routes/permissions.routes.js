const express = require("express");
const permissions = require("../controllers/permissions.controller");
const { authenticate, requirePermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", requirePermission("permissions:read"), permissions.listPermissions);

module.exports = router;

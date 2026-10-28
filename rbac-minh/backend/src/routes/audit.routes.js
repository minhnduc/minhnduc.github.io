const express = require("express");
const audit = require("../controllers/audit.controller");
const { authenticate, requirePermission } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", requirePermission("audit-logs:read"), audit.listAuditLogs);

module.exports = router;

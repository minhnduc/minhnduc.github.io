const AuditLog = require("../models/AuditLog");
const { toAuditLog } = require("../utils/serializers");
const { parseListQuery, assertQuery, pageMeta } = require("../utils/listQuery");

/** GET /audit-logs: Xem nhật ký kiểm toán (Mở rộng) */
async function listAuditLogs(req, res) {
  const { page, limit, skip, details } = parseListQuery(req.query, {
    sortable: ["createdAt"],
    defaultSort: "-createdAt",
    defaultLimit: 20,
    maxLimit: 100,
  });

  const { action, targetType } = req.query;
  const filter = {};
  if (action && typeof action === "string") filter.action = action.trim();
  if (targetType && typeof targetType === "string") filter.targetType = targetType.trim();

  assertQuery(details);

  const [logs, totalItems] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    data: logs.map(toAuditLog),
    meta: pageMeta(page, limit, totalItems),
  });
}

module.exports = { listAuditLogs };

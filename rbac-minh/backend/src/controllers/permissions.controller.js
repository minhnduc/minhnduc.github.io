const crypto = require("node:crypto");
const Permission = require("../models/Permission");
const { toPermission } = require("../utils/serializers");
const { AppError, issue } = require("../utils/AppError");

/** GET /permissions: Hỗ trợ ETag / 304 Not Modified (Mở rộng) */
async function listPermissions(req, res) {
  if (req.query.resource !== undefined) {
    if (typeof req.query.resource !== "string" || !req.query.resource.trim()) {
      throw new AppError(400, "INVALID_QUERY_PARAMETER", "resource phải là chuỗi không rỗng.", [
        issue("resource", "INVALID_VALUE", "resource phải là chuỗi không rỗng."),
      ]);
    }
  }

  const filter = req.query.resource ? { resource: req.query.resource.trim() } : {};
  const permissions = await Permission.find(filter).sort({ resource: 1, code: 1 }).lean();
  const data = permissions.map(toPermission);

  const payload = JSON.stringify({ data, meta: { totalItems: data.length } });
  const etag = `W/"${crypto.createHash("md5").update(payload).digest("hex")}"`;

  res.set("ETag", etag);
  res.set("Cache-Control", "public, max-age=60");

  if (req.get("If-None-Match") === etag) {
    return res.status(304).end();
  }

  res.json({ data, meta: { totalItems: data.length } });
}

module.exports = { listPermissions };

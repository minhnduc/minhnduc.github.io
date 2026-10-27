const { AppError, issue } = require("./AppError");

/** Thoát ký tự đặc biệt trước khi đưa chuỗi người dùng nhập vào $regex (chống ReDoS / lỗi regex). */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function readSingle(query, name, details) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    details.push(issue(name, "INVALID_TYPE", `Tham số ${name} chỉ được truyền một lần.`));
    return undefined;
  }
  return value;
}

/**
 * Đọc page, limit, sort, q dùng chung cho mọi endpoint danh sách.
 * Trả về `details` để endpoint bổ sung lỗi của các bộ lọc riêng trước khi gọi assertQuery().
 */
function parseListQuery(query, { sortable, defaultSort, defaultLimit = 10, maxLimit = 100 }) {
  const details = [];
  const rawPage = readSingle(query, "page", details);
  const rawLimit = readSingle(query, "limit", details);
  const rawSort = readSingle(query, "sort", details);
  const rawQ = readSingle(query, "q", details);

  let page = 1;
  if (rawPage !== undefined) {
    page = /^\d{1,6}$/.test(rawPage) ? Number(rawPage) : NaN;
    if (!(page >= 1)) details.push(issue("page", "INVALID_VALUE", "page phải là số nguyên từ 1 trở lên."));
  }

  let limit = defaultLimit;
  if (rawLimit !== undefined) {
    limit = /^\d{1,4}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!(limit >= 1 && limit <= maxLimit)) {
      details.push(issue("limit", "OUT_OF_RANGE", `limit phải là số nguyên trong khoảng 1–${maxLimit}.`));
    }
  }

  const sort = {};
  const sortTokens = (rawSort ?? defaultSort).split(",").map((token) => token.trim()).filter(Boolean);
  if (rawSort !== undefined && sortTokens.length === 0) {
    details.push(issue("sort", "INVALID_VALUE", "sort không được để trống."));
  }
  for (const token of sortTokens) {
    const descending = token.startsWith("-");
    const field = descending ? token.slice(1) : token;
    if (!sortable.includes(field)) {
      details.push(issue("sort", "FIELD_NOT_SORTABLE", `Không hỗ trợ sắp xếp theo '${field}'. Cho phép: ${sortable.join(", ")}.`));
    } else {
      sort[field] = descending ? -1 : 1;
    }
  }
  sort._id = 1; // khóa phụ giúp thứ tự ổn định giữa các trang

  let q = "";
  if (rawQ !== undefined) {
    q = rawQ.trim();
    if (q.length < 2 || q.length > 100) details.push(issue("q", "INVALID_LENGTH", "q phải có từ 2 đến 100 ký tự."));
  }

  return { page, limit, skip: (page - 1) * limit, sort, q, details };
}

function assertQuery(details) {
  if (details.length) throw new AppError(400, "INVALID_QUERY_PARAMETER", "Tham số truy vấn không hợp lệ.", details);
}

const pageMeta = (page, limit, totalItems) => ({
  page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)),
});

module.exports = { escapeRegex, parseListQuery, assertQuery, pageMeta };

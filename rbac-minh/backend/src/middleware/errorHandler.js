const { AppError, issue } = require("../utils/AppError");

function notFound(req, res, next) {
  next(new AppError(404, "ENDPOINT_NOT_FOUND", `Không tồn tại endpoint ${req.method} ${req.originalUrl.split("?")[0]}.`));
}

/** Chuyển mọi loại lỗi về một định dạng duy nhất: { error: { code, message, details? } }. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (err.type === "entity.parse.failed") {
    error = new AppError(400, "MALFORMED_JSON", "Body không phải JSON hợp lệ.");
  } else if (err.type === "entity.too.large") {
    error = new AppError(413, "PAYLOAD_TOO_LARGE", "Body vượt quá dung lượng cho phép.");
  } else if (err.type === "encoding.unsupported" || err.type === "charset.unsupported") {
    error = new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Chỉ hỗ trợ JSON mã hóa UTF-8.");
  } else if (err.name === "ValidationError") {
    // Lớp phòng thủ cuối: validator của Mongoose bắt được thứ mà validator ở controller bỏ sót.
    const details = Object.values(err.errors).map((e) => issue(e.path, e.kind === "required" ? "REQUIRED" : "INVALID_VALUE", e.message));
    error = new AppError(400, "VALIDATION_ERROR", "Dữ liệu đầu vào không hợp lệ.", details);
  } else if (err.code === 11000) {
    // Unique index là chốt chặn cuối cho race condition khi hai request cùng tạo một email / mã vai trò.
    error = err.keyPattern?.email
      ? new AppError(409, "EMAIL_ALREADY_EXISTS", "Email đã được sử dụng.", [issue("email", "DUPLICATE", "Email đã được sử dụng.")])
      : new AppError(409, "ROLE_CODE_EXISTS", "Mã vai trò đã tồn tại.", [issue("code", "DUPLICATE", "Mã vai trò đã tồn tại.")]);
  } else if (!(err instanceof AppError)) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    error = new AppError(500, "INTERNAL_ERROR", "Đã có lỗi phía máy chủ. Vui lòng thử lại sau.");
  }

  const body = { code: error.code, message: error.message };
  if (error.details?.length) body.details = error.details;
  if (error.headers) res.set(error.headers);
  res.status(error.status).json({ error: body });
}

module.exports = { notFound, errorHandler };

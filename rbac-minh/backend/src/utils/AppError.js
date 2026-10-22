/**
 * Lỗi nghiệp vụ có mã trạng thái HTTP và mã lỗi máy đọc được.
 * Controller chỉ cần `throw new AppError(...)`; errorHandler sẽ định dạng response
 * theo cấu trúc thống nhất { error: { code, message, details? } }.
 */
class AppError extends Error {
  constructor(status, code, message, details = [], headers = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

/** Một mục trong error.details: trường nào, lỗi gì, thông báo cho người dùng. */
const issue = (field, code, message) => ({ field, issue: code, message });

module.exports = { AppError, issue };

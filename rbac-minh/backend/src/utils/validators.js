const mongoose = require("mongoose");
const { AppError, issue } = require("./AppError");

const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^\+[1-9]\d{7,14}$/,
  roleCode: /^[a-z][a-z0-9-]{2,49}$/,
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value) && mongoose.isValidObjectId(value);

function assertJsonObject(body) {
  if (!isPlainObject(body)) {
    throw new AppError(400, "VALIDATION_ERROR", "Body phải là một đối tượng JSON.", [
      issue("body", "INVALID_TYPE", "Body phải là một đối tượng JSON."),
    ]);
  }
}

/** Allow-list: mọi trường ngoài danh sách cho phép đều bị từ chối (chống mass assignment). */
function collectUnknownFields(body, allowed, details) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      details.push(issue(key, "FIELD_NOT_ALLOWED", `Trường '${key}' không được phép gửi lên endpoint này.`));
    }
  }
}

/**
 * Kiểm tra một trường chuỗi theo luật: required, nullable, min, max, pattern.
 * Không ném lỗi ngay mà gom vào `details` để trả về tất cả lỗi trong một lần.
 */
function checkText(body, field, rule, details) {
  if (!has(body, field)) {
    if (rule.required) details.push(issue(field, "REQUIRED", `${rule.label} là bắt buộc.`));
    return;
  }
  const value = body[field];
  if (value === null && rule.nullable) return;
  if (typeof value !== "string") {
    details.push(issue(field, "INVALID_TYPE", `${rule.label} phải là chuỗi${rule.nullable ? " hoặc null" : ""}.`));
    return;
  }
  const text = value.trim();
  if (!text) {
    if (rule.nullable) return;
    details.push(issue(field, "REQUIRED", `${rule.label} không được để trống.`));
    return;
  }
  if ((rule.min && text.length < rule.min) || (rule.max && text.length > rule.max)) {
    const range = rule.min ? `từ ${rule.min} đến ${rule.max}` : `tối đa ${rule.max}`;
    details.push(issue(field, "INVALID_LENGTH", `${rule.label} phải có ${range} ký tự.`));
    return;
  }
  if (rule.pattern && !rule.pattern.test(text)) {
    details.push(issue(field, "INVALID_FORMAT", rule.patternMessage));
  }
}

/** Mật khẩu mạnh: 8–72 ký tự (giới hạn của bcrypt), có thường, hoa, số, ký tự đặc biệt. */
function passwordIssue(password, field = "password") {
  if (typeof password !== "string" || password.length === 0) {
    return issue(field, "REQUIRED", "Mật khẩu là bắt buộc.");
  }
  const strong = password.length >= 8 && password.length <= 72
    && /[a-z]/.test(password) && /[A-Z]/.test(password)
    && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
  return strong ? null : issue(field, "WEAK_PASSWORD", "Mật khẩu cần 8–72 ký tự, gồm chữ thường, chữ hoa, chữ số và ký tự đặc biệt.");
}

function throwIfInvalid(details) {
  if (details.length) throw new AppError(400, "VALIDATION_ERROR", "Dữ liệu đầu vào không hợp lệ.", details);
}

module.exports = {
  PATTERNS, isPlainObject, has, isObjectId,
  assertJsonObject, collectUnknownFields, checkText, passwordIssue, throwIfInvalid,
};

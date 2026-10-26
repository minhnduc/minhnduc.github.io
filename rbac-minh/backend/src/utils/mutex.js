/**
 * Hàng đợi tuần tự trong một tiến trình Node.
 *
 * Một số quy tắc là kiểu "kiểm tra rồi ghi" (check-then-act), ví dụ:
 *   - phải còn ít nhất một super-admin đang hoạt động,
 *   - không xóa vai trò khi vẫn còn người dùng.
 * Nếu hai request chạy xen kẽ, cả hai có thể cùng vượt qua bước kiểm tra.
 * `exclusive(task)` bảo đảm các đoạn đó chạy lần lượt.
 *
 * Giới hạn: chỉ có hiệu lực khi backend chạy một instance (đúng với gói miễn phí của Render).
 */
let tail = Promise.resolve();

function exclusive(task) {
  const run = tail.then(() => task());
  tail = run.catch(() => undefined);
  return run;
}

module.exports = { exclusive };

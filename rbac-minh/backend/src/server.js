const mongoose = require("mongoose");
const app = require("./app");
const { env, assertEnv } = require("./config/env");

async function start() {
  assertEnv();
  console.log("Đang kết nối MongoDB...");
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`Đã kết nối MongoDB Database: ${mongoose.connection.name}`);

  return new Promise((resolve, reject) => {
    const server = app.listen(env.port, (err) => {
      if (err) return reject(err);
      console.log(`Backend server đang lắng nghe tại: http://localhost:${env.port}/api/v1`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Không thể khởi động server:", err.message);
    process.exit(1);
  });
}

module.exports = { start };

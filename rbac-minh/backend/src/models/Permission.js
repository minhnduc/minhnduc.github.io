const mongoose = require("mongoose");

const permissionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, match: /^[a-z-]+:[a-z-]+$/ },
    resource: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { versionKey: false },
);

module.exports = mongoose.model("Permission", permissionSchema);

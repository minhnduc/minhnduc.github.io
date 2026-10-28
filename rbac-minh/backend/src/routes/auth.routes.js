const express = require("express");
const auth = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth");
const { loginRateLimit } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/auth/tokens", loginRateLimit, auth.login);
router.post("/auth/refresh", auth.refreshTokens);
router.post("/auth/logout", auth.logout);

router.get("/me", authenticate, auth.me);
router.patch("/me", authenticate, auth.updateMe);
router.put("/me/password", authenticate, auth.changePassword);

module.exports = router;

const rateLimit = require("express-rate-limit");
const logger = require("../logger");

const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS),
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS),

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Too many requests. Please try again later."
  },

  handler: (req, res) => {

    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      method: req.method,
      url: req.originalUrl
    });

    res.status(429).json({
      error: "Too many requests. Please try again later."
    });
  }
});

module.exports = rateLimiter;
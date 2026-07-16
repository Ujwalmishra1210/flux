const express = require("express");
const pool = require("../db/postgres");
const IORedis = require("ioredis");

const router = express.Router();

router.get("/", async (req, res) => {
  const checks = {};

  try {
    await pool.query("SELECT 1");
    checks.postgres = "up";
  } catch (err) {
    checks.postgres = "down";
  }

  try {
    const redis = new IORedis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  
    redis.on("error", () => {});
  
    await redis.connect();
    await redis.ping();
    await redis.quit();
  
    checks.redis = "up";
  } catch (err) {
    checks.redis = "down";
  }

  const healthy =
    checks.postgres === "up" &&
    checks.redis === "up";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    service: "api-service",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks,
  });
});

module.exports = router;
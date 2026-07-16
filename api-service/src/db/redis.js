const IORedis = require("ioredis");

const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  console.error("Redis Error:", err.message);
});

module.exports = redis;
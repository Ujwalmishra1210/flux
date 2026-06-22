const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null
});

const notificationQueue = new Queue(
  "notifications",
  {
    connection
  }
);

module.exports = notificationQueue;
require("dotenv").config();

const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

const dlqWorker = new Worker(
  "dead-letter-notifications",
  async (job) => {

    console.log("\n===== DEAD LETTER QUEUE =====");

    console.log("Notification ID:", job.data.notificationId);
    console.log("Original Job ID:", job.data.originalJobId);
    console.log("Reason:", job.data.reason);
    console.log("Failed At:", job.data.failedAt);

    console.log("=============================\n");

  },
  {
    connection,
  }
);

console.log("DLQ Worker Started");
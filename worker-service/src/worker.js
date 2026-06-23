require("dotenv").config();

const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "notifications",
  async (job) => {
    console.log(
      "Processing notification:",
      job.data.notificationId
    );
  },
  {
    connection,
  }
);

console.log("Worker Started");
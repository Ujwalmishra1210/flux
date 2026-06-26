require("dotenv").config();

const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

const dlq = new Queue(
  "dead-letter-notifications",
  {
    connection,
  }
);

(async () => {
  const jobs = await dlq.getJobs([
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  ]);

  console.log("\n===== DEAD LETTER QUEUE =====\n");

  if (jobs.length === 0) {
    console.log("No jobs found.");
  }

  for (const job of jobs) {
    console.log("DLQ Job ID:", job.id);
    console.log("State:", await job.getState());
    console.log("Data:", job.data);
    console.log("-----------------------------------");
  }

  process.exit(0);
})();
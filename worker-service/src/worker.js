require("dotenv").config();

const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const pool = require("./db/postgres");

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "notifications",
  async (job) => {

    const notificationId =
      job.data.notificationId;

    console.log(
      "Processing notification:",
      notificationId
    );

    await pool.query(
      `
      UPDATE notifications
      SET status = $1
      WHERE id = $2
      `,
      [
        "PROCESSING",
        notificationId
      ]
    );

    await new Promise(
      resolve =>
        setTimeout(resolve, 3000)
    );

    await pool.query(
      `
      UPDATE notifications
      SET status = $1
      WHERE id = $2
      `,
      [
        "SENT",
        notificationId
      ]
    );

    console.log(
      "Notification sent:",
      notificationId
    );

  },
  {
    connection,
  }
);

console.log("Worker Started");
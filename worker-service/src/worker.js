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
    console.log(
        `Attempt ${job.attemptsMade + 1}`
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

    const shouldFail =
      Math.random() < 0.5;

    if (shouldFail) {

      console.log(
        "Simulated failure:",
        notificationId
      );

      throw new Error(
        "Notification provider unavailable"
      );

    }

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

worker.on(
  "failed",
  async (job, err) => {

    console.log(
      `Job ${job.id} failed`
    );

    console.log(
      err.message
    );

    if (
      job.attemptsMade >=
      job.opts.attempts
    ) {

      await pool.query(
        `
        UPDATE notifications
        SET status='FAILED'
        WHERE id=$1
        `,
        [
          job.data.notificationId
        ]
      );

      console.log(
        "Marked FAILED"
      );

    }

  }
);

console.log("Worker Started");
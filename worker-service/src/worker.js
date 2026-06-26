require("dotenv").config();

const { Worker, Queue } = require("bullmq");
const IORedis = require("ioredis");

const pool = require("./db/postgres");

const connection = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});
const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: null,
});
const getLockKey = (id) => `notification:${id}`;
let failureCount = 0;
let circuitOpen = false;
const FAILURE_THRESHOLD = 3;
const CIRCUIT_RESET_TIME = 30000; // 30 sec
const deadLetterQueue = new Queue(
  "dead-letter-notifications",
  {
    connection,
  }
);
const worker = new Worker(
  "notifications",
  async (job) => {
    if (circuitOpen) {
      console.log("Circuit OPEN - skipping job:", job.data.notificationId);
      return;
    }
    const lockKey = getLockKey(job.data.notificationId);

    const existingLock = await redis.get(lockKey);
    
    if (existingLock) {
      console.log(`Duplicate job detected: ${job.data.notificationId}`);
      return;
    }
    
    await redis.set(lockKey, "locked", "EX", 60);
    const notificationId =
      job.data.notificationId;

    console.log(
      "Processing notification:",
      notificationId
    );

    const result = await pool.query(
      `
      SELECT status
      FROM notifications
      WHERE id = $1
      `,
      [notificationId]
    );
    
    if (result.rows[0].status === "SENT") {
      console.log(
        `Notification ${notificationId} already processed. Skipping.`
      );
      return;
    }
    console.log(
        `Attempt ${job.attemptsMade + 1}`
      );
      const updateResult = await pool.query(
        `
        UPDATE notifications
        SET status = 'PROCESSING'
        WHERE id = $1
          AND status = 'PENDING'
        RETURNING id
        `,
        [notificationId]
      );
      
      if (updateResult.rowCount === 0) {
        console.log(
          `Notification ${notificationId} is already being processed or completed. Skipping.`
        );
        return;
      }

      const shouldFail = Math.random() < 0.5;

    if (shouldFail) {

      console.log(
        "Simulated failure:",
        notificationId
      );
      failureCount++;

if (failureCount >= FAILURE_THRESHOLD) {
  circuitOpen = true;

  console.log("🔥 CIRCUIT OPENED - too many failures");

  setTimeout(() => {
    circuitOpen = false;
    failureCount = 0;
    console.log("🟢 CIRCUIT RESET - system recovered");
  }, CIRCUIT_RESET_TIME);
}
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
      SET
          status = 'SENT',
          failure_reason = NULL,
          failed_at = NULL
      WHERE id = $1
        AND status = 'PROCESSING'
      `,
      [notificationId]
    );
    try {
      await redis.del(lockKey);
    } catch (e) {
      console.error("Lock cleanup failed:", e.message);
    }
    console.log(
      "Notification sent:",
      notificationId
    );
    failureCount = 0;
  },
  {
    connection,
  }
);

worker.on(
  "failed",
  async (job, err) => {
    const lockKey = getLockKey(job.data.notificationId);
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
    
      await deadLetterQueue.add(
        "dead-notification",
        {
          notificationId: job.data.notificationId,
          originalJobId: job.id,
          reason: err.message,
          failedAt: new Date().toISOString()
        }
      );
    
      await pool.query(
        `
        UPDATE notifications
        SET
            status = 'FAILED',
            failure_reason = $1,
            failed_at = NOW()
        WHERE id = $2
        `,
        [
          err.message,
          job.data.notificationId
        ]
      );
      try {
        await redis.del(lockKey);
      } catch (e) {
        console.error("Lock cleanup failed:", e.message);
      }
    
      console.log(
        `Notification ${job.data.notificationId} moved to Dead Letter Queue`
      );
    
    }else {

      await pool.query(
        `
        UPDATE notifications
        SET
            status = 'PENDING',
            failure_reason = NULL,
            failed_at = NULL
        WHERE id = $1
        `,
        [job.data.notificationId]
      );

      console.log(
        "Reset status to PENDING for retry"
      );

    }

  }
);

console.log("Worker Started");
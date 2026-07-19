require("dotenv").config();

const { Worker, Queue } = require("bullmq");
const IORedis = require("ioredis");

const express = require("express");
const {
  client,
  notificationsSentCounter,
  notificationsFailedCounter
} = require("./metrics");
const pool = require("./db/postgres");
const logger = require("./logger");
const { getProvider } = require("./providers/providerFactory");
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

connection.on("error", (err) => {
  logger.error("BullMQ Redis connection error", {
    error: err.message,
  });
});

redis.on("error", (err) => {
  logger.error("Redis client error", {
    error: err.message,
  });
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
const app = express();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
app.get("/health", async (req, res) => {
  const checks = {};

  try {
    await pool.query("SELECT 1");
    checks.postgres = "up";
  } catch (err) {
    checks.postgres = "down";
  }

  try {
    const healthRedis = new IORedis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    healthRedis.on("error", () => {});

    await healthRedis.connect();
    await healthRedis.ping();
    await healthRedis.quit();

    checks.redis = "up";
  } catch (err) {
    checks.redis = "down";
  }

  const healthy =
    checks.postgres === "up" &&
    checks.redis === "up";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "unhealthy",
    service: "worker-service",
    checks,
  });
});
app.listen(3001, () => {
  logger.info("Worker metrics server running on port 3001");
});
const worker = new Worker(
  "notifications",
  async (job) => {
    const {
      notificationId,
      correlationId
    } = job.data;

    if (circuitOpen) {
      logger.warn("Circuit open - skipping notification", {
        notificationId,
        correlationId,
        jobId: job.id
      });
      return;
    }
    const lockKey = getLockKey(notificationId);

    const existingLock = await redis.get(lockKey);
    
    if (existingLock) {
      logger.warn("Duplicate job detected", {
        notificationId,
        correlationId,
        jobId: job.id
      });
      return;
    }
    
    await redis.set(lockKey, "locked", "EX", 60);
    

    logger.info("Processing notification", {
      notificationId,
      correlationId,
      jobId: job.id
    });

    const result = await pool.query(
      `
      SELECT status,channel
      FROM notifications
      WHERE id = $1
      `,
      [notificationId]
    );
    
    if (result.rows[0].status === "SENT") {
      logger.info("Notification already processed", {
        notificationId,
        correlationId,
        jobId: job.id
      });
      return;
    }
    const notification = result.rows[0];
    const provider = getProvider(notification.channel);
    logger.info("Processing attempt", {
      notificationId,
      correlationId,
      jobId: job.id,
      attempt: job.attemptsMade + 1
    });
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
        logger.warn("Notification already processing or completed", {
          notificationId,
          correlationId,
          jobId: job.id
        });
        return;
      }

      try {
        await provider.send(notification);
      } catch (err) {
      
        logger.warn(err.message, {
          notificationId,
          correlationId,
          jobId: job.id
        });
      
        failureCount++;
      
        if (failureCount >= FAILURE_THRESHOLD) {
          circuitOpen = true;
      
          logger.error("Circuit opened", {
            failureCount
          });
      
          setTimeout(() => {
            circuitOpen = false;
            failureCount = 0;
            logger.info("Circuit reset");
          }, CIRCUIT_RESET_TIME);
        }
      
        throw err;
      }

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
    notificationsSentCounter.inc();
    try {
      await redis.del(lockKey);
    } catch (e) {
      logger.error("Failed to release Redis lock", {
        lockKey,
        error: e.message
      });
    }
    logger.info("Notification sent", {
      notificationId,
      correlationId,
      jobId: job.id
    });
    failureCount = 0;
  },
  {
    connection,
  }
);

worker.on(
  "failed",
  async (job, err) => {

    const {
      notificationId,
      correlationId
    } = job.data;
    const lockKey = getLockKey(notificationId);

    logger.error("Job failed", {
      jobId: job.id,
      notificationId,
      correlationId
    });

    logger.error(err.message, {
      jobId: job.id,
      notificationId,
      correlationId
    });

    if (job.attemptsMade >= job.opts.attempts) {

      await deadLetterQueue.add(
        "dead-notification",
        {
          notificationId,
          correlationId,
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
          notificationId
        ]
      );
      notificationsFailedCounter.inc();
      try {
        await redis.del(lockKey);
      } catch (e) {
        logger.error("Failed to release Redis lock", {
          lockKey,
          error: e.message
        });
      }

      logger.error("Notification moved to Dead Letter Queue", {
        jobId: job.id,
        notificationId,
        correlationId
      });

    } else {

      await pool.query(
        `
        UPDATE notifications
        SET
            status = 'PENDING',
            failure_reason = NULL,
            failed_at = NULL
        WHERE id = $1
        `,
        [notificationId]
      );

      // Release the lock so BullMQ retry can process it again
      try {
        await redis.del(lockKey);
      } catch (e) {
        logger.error("Failed to release Redis lock", {
          lockKey,
          error: e.message
        });
      }

      logger.info("Notification reset to PENDING for retry", {
        jobId: job.id,
        notificationId,
        correlationId
      });

    }
  }
);

logger.info("Worker started");

async function shutdown(signal) {
  logger.info(`Received ${signal}. Shutting down worker...`);

  try {
    await worker.close();
    logger.info("BullMQ worker closed");

    await pool.end();
    logger.info("PostgreSQL connection closed");

    await redis.quit();
    await connection.quit();
    logger.info("Redis connections closed");

    process.exit(0);

  } catch (err) {
    logger.error("Error during shutdown", {
      error: err.message
    });

    process.exit(1);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
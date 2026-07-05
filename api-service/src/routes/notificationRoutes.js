const express = require("express");
const logger = require("../logger");
const crypto = require("crypto");
const pool = require("../db/postgres");
const validateNotification = require("../middleware/validateNotification");
const notificationQueue =
    require("../queue/notificationQueue");
    const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const router = express.Router();

const redis = new IORedis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    maxRetriesPerRequest: null
});


router.post("/",validateNotification, async (req, res) => {

    try {

        const {
            eventType,
            recipient,
            channel
        } = req.body;

        const id = crypto.randomUUID();
        const correlationId = crypto.randomUUID();
        await pool.query(
            `
            INSERT INTO notifications
            (
                id,
                event_type,
                recipient,
                channel,
                status
            )
            VALUES
            (
                $1,$2,$3,$4,$5
            )
            `,
            [
                id,
                eventType,
                recipient,
                channel,
                "PENDING"
            ]
        );
        await notificationQueue.add(
          "send-notification",
          {
            notificationId: id,
            correlationId
          },
          {
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000
            }
          }
        );
        logger.info("Notification queued", {
          notificationId: id,
          correlationId,
          eventType,
          recipient,
          channel
        });
        res.status(201).json({
          id,
          correlationId,
          message: "Notification created"
      });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Internal Server Error"
        });

    }

});
router.post("/:id/replay", async (req, res) => {
    try {
      const { id } = req.params;
  
      const result = await pool.query(
        `
        SELECT *
        FROM notifications
        WHERE id = $1
        `,
        [id]
      );
  
      if (result.rowCount === 0) {
        return res.status(404).json({
          error: "Notification not found",
        });
      }
  
      const notification = result.rows[0];
  
      if (notification.status !== "FAILED") {
        return res.status(400).json({
          error: "Only FAILED notifications can be replayed",
        });
      }
  
      await pool.query(
        `
        UPDATE notifications
        SET
          status = 'PENDING',
          failure_reason = NULL,
          failed_at = NULL
        WHERE id = $1
        `,
        [id]
      );
  
      await notificationQueue.add(
        "send-notification",
        {
          notificationId: id,
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        }
      );
  
      res.json({
        message: "Notification replayed successfully",
      });
    } catch (err) {
      console.error(err);
  
      res.status(500).json({
        error: "Internal Server Error",
      });
    }
  });
  router.get("/health", async (req, res) => {
    try {
      const dbResult = await pool.query("SELECT 1");
      const redisResult = await redis.ping();
  
      res.json({
        status: "OK",
        database: dbResult.rowCount === 1,
        redis: redisResult === "PONG",
        timestamp: new Date().toISOString()
      });
  
    } catch (err) {
      console.error(err);
  
      res.status(500).json({
        status: "FAIL",
        error: err.message
      });
    }
  });
  router.get("/metrics", async (req, res) => {
    try {
      const counts = await notificationQueue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
  
      res.json({
        queue: "notifications",
        ...counts
      });
  
    } catch (err) {
      console.error(err);
  
      res.status(500).json({
        error: err.message
      });
    }
  });
module.exports = router;
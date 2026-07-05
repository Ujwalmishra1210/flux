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

/**
 * @swagger
 * /notifications:
 *   post:
 *     summary: Queue a notification
 *     description: Creates a notification, stores it in PostgreSQL and queues it for background processing.
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventType
 *               - recipient
 *               - channel
 *             properties:
 *               eventType:
 *                 type: string
 *                 example: ORDER_PLACED
 *               recipient:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               channel:
 *                 type: string
 *                 enum:
 *                   - EMAIL
 *                   - SMS
 *                   - PUSH
 *                 example: EMAIL
 *     responses:
 *       201:
 *         description: Notification queued successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: 550e8400-e29b-41d4-a716-446655440000
 *                 correlationId:
 *                   type: string
 *                   format: uuid
 *                   example: 5de35c3d-b08f-4d96-91d6-4ec8e2484e61
 *                 message:
 *                   type: string
 *                   example: Notification created
 *       400:
 *         description: Validation failed.
 *       429:
 *         description: Too many requests.
 *       500:
 *         description: Internal Server Error.
 */
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
/**
 * @swagger
 * /notifications/{id}/replay:
 *   post:
 *     summary: Replay a failed notification
 *     description: Requeues a notification that is currently in the FAILED state.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Notification ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification replayed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Notification replayed successfully
 *       400:
 *         description: Notification is not in FAILED state.
 *       404:
 *         description: Notification not found.
 *       500:
 *         description: Internal Server Error.
 */
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
/**
 * @swagger
 * /notifications/health:
 *   get:
 *     summary: Health check
 *     description: Checks the health of the notification service, PostgreSQL and Redis.
 *     tags:
 *       - Monitoring
 *     responses:
 *       200:
 *         description: Service is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 database:
 *                   type: boolean
 *                   example: true
 *                 redis:
 *                   type: boolean
 *                   example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Service health check failed.
 */
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
  /**
 * @swagger
 * /notifications/metrics:
 *   get:
 *     summary: Get queue metrics
 *     description: Returns BullMQ queue statistics for the notification processing queue.
 *     tags:
 *       - Monitoring
 *     responses:
 *       200:
 *         description: Queue metrics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queue:
 *                   type: string
 *                   example: notifications
 *                 waiting:
 *                   type: integer
 *                   example: 2
 *                 active:
 *                   type: integer
 *                   example: 1
 *                 completed:
 *                   type: integer
 *                   example: 25
 *                 failed:
 *                   type: integer
 *                   example: 3
 *                 delayed:
 *                   type: integer
 *                   example: 0
 *       500:
 *         description: Internal Server Error.
 */
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
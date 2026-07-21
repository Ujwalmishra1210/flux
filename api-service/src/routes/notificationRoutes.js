const express = require("express");
const logger = require("../logger");
const crypto = require("crypto");
const pool = require("../db/postgres");
const { notificationCounter } = require("../metrics");
const validateNotification = require("../middleware/validateNotification");
const apiKeyAuth = require("../middleware/apiKeyAuth");
const validateNotificationQuery =
require("../middleware/validateNotificationQuery");
const redis = require("../db/redis");
const notificationQueue =
    require("../queue/notificationQueue");
    const { Queue } = require("bullmq");

const router = express.Router();



/**
 * @swagger
 * /notifications:
 *   post:
 *     summary: Queue a notification
 *     description: Creates a notification, stores it in PostgreSQL and queues it for background processing.
 *     tags:
 *       - Notifications
 *     security:
 *       - ApiKeyAuth: []
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
router.post("/",apiKeyAuth,validateNotification, async (req, res) => {

    try {

      const {
        eventType,
        recipient,
        channel,
        data,
        scheduledAt
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
                      status,
                      scheduled_at
                  )
                  VALUES
                  (
                      $1,$2,$3,$4,$5,$6
                  )
            `,
            [
              id,
              eventType,
              recipient,
              channel,
              "PENDING",
              scheduledAt || null
          ]
        );
        const delay = scheduledAt
          ? Math.max(new Date(scheduledAt).getTime() - Date.now(), 0)
          : 0;
          await notificationQueue.add(
            "send-notification",
            {
              notificationId: id,
              correlationId,
              data: data || {}
            },
            {
              delay,
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 2000
              }
            }
          );
        notificationCounter.inc();
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
 *     security:
 *       - ApiKeyAuth: []
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
router.post("/:id/replay",apiKeyAuth, async (req, res) => {
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
          correlationId,
          data: req.body.data || {}
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000
          }
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
 *     security:
 *       - ApiKeyAuth: []
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
  router.get("/metrics",apiKeyAuth, async (req, res) => {
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
  /**
 * @swagger
 * /notifications:
 *   get:
 *     summary: List notifications
 *     description: Retrieves notifications with optional status filtering and pagination, ordered by newest first.
 *     tags:
 *       - Notifications
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number.
 *         schema:
 *           type: integer
 *           default: 1
 *           example: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of notifications to return per page.
 *         schema:
 *           type: integer
 *           default: 10
 *           example: 10
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter notifications by status.
 *         schema:
 *           type: string
 *           enum:
 *             - PENDING
 *             - PROCESSING
 *             - SENT
 *             - FAILED
 *           example: SENT
 *       - in: query
 *         name: channel
 *         required: false
 *         description: Filter notifications by delivery channel.
 *         schema:
 *           type: string
 *           enum:
 *             - EMAIL
 *             - SMS
 *             - PUSH
 *           example: EMAIL 
 *       - in: query
 *         name: eventType
 *         required: false
 *         description: Filter notifications by event type.
 *         schema:
 *           type: string
 *           example: ORDER_PLACED
  *       - in: query
 *         name: sortBy
 *         required: false
 *         description: Field used for sorting notifications.
 *         schema:
 *           type: string
 *           enum:
 *             - created_at
 *             - status
 *             - channel
 *             - event_type
 *           default: created_at
 *           example: created_at
 *       - in: query
 *         name: order
 *         required: false
 *         description: Sorting direction.
 *         schema:
 *           type: string
 *           enum:
 *             - asc
 *             - desc
 *           default: desc
 *           example: desc      
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 total:
 *                   type: integer
 *                   example: 57
 *                   description: Total number of notifications matching the applied filters.
 *                 totalPages:
 *                   type: integer
 *                   example: 6
 *                   description: Total number of available pages.
 *                 notifications:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: 0d35e70f-1522-421a-ad01-cbf02b0b9085
 *                       recipient:
 *                         type: string
 *                         example: user@example.com
 *                       channel:
 *                         type: string
 *                         example: EMAIL
 *                       event_type:
 *                         type: string
 *                         example: ORDER_PLACED
 *                       status:
 *                         type: string
 *                         example: SENT
 *                       failure_reason:
 *                         type: string
 *                         nullable: true
 *                         example: Notification provider unavailable
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       failed_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *       500:
 *         description: Internal Server Error.
 */
router.get("/",apiKeyAuth,validateNotificationQuery, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const {
      status,
      channel,
      eventType,
      sortBy = "created_at",
      order = "desc"
  } = req.query;
    const allowedSortFields = [
      "created_at",
      "status",
      "channel",
      "event_type"
  ];

    const allowedOrder = [
        "asc",
        "desc"
    ];

    const sortField = allowedSortFields.includes(sortBy)
        ? sortBy
        : "created_at";

    const sortOrder = allowedOrder.includes(order.toLowerCase())
        ? order.toUpperCase()
        : "DESC";
    let query = `
      SELECT
          id,
          recipient,
          channel,
          event_type,
          status,
          failure_reason,
          created_at,
          failed_at
      FROM notifications
`;

    const values = [];
    const conditions = [];

    if (status) {
        conditions.push(`status = $${values.length + 1}`);
        values.push(status);
    }

    if (channel) {
        conditions.push(`channel = $${values.length + 1}`);
        values.push(channel);
    }
    if (eventType) {
      conditions.push(`event_type = $${values.length + 1}`);
      values.push(eventType);
  }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(" AND ");
    }

    query += `
    ORDER BY ${sortField} ${sortOrder}
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
    `;

    values.push(limit);
    values.push(offset);

    const result = await pool.query(query, values);
    let countQuery = `
      SELECT COUNT(*) 
      FROM notifications
      `;

    const countValues = [];
    const countConditions = [];

    if (status) {
        countConditions.push(`status = $${countValues.length + 1}`);
        countValues.push(status);
    }

    if (channel) {
        countConditions.push(`channel = $${countValues.length + 1}`);
        countValues.push(channel);
    }

    if (eventType) {
        countConditions.push(`event_type = $${countValues.length + 1}`);
        countValues.push(eventType);
    }

    if (countConditions.length > 0) {
        countQuery += ` WHERE ${countConditions.join(" AND ")}`;
    }

    const countResult = await pool.query(
        countQuery,
        countValues
    );

    const total = Number(countResult.rows[0].count);

    const totalPages = Math.ceil(total / limit);
    res.json({
      page,
      limit,
      total,
      totalPages,
      notifications: result.rows
  });

  } catch (err) {
    logger.error("Failed to fetch notifications", {
      error: err.message,
    });

    res.status(500).json({
      error: "Internal Server Error",
    });
  }
});
/**
 * @swagger
 * /notifications/stats:
 *   get:
 *     summary: Get notification statistics
 *     description: Returns aggregated notification statistics grouped by status.
 *     tags:
 *       - Notifications
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Notification statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 125
 *                   description: Total number of notifications.
 *                 pending:
 *                   type: integer
 *                   example: 8
 *                   description: Number of pending notifications.
 *                 processing:
 *                   type: integer
 *                   example: 2
 *                   description: Number of notifications currently being processed.
 *                 sent:
 *                   type: integer
 *                   example: 110
 *                   description: Number of successfully delivered notifications.
 *                 failed:
 *                   type: integer
 *                   example: 5
 *                   description: Number of failed notifications.
 *       500:
 *         description: Internal Server Error.
 */
router.get("/stats", apiKeyAuth, async (req, res) => {
  try {

      const result = await pool.query(`
          SELECT
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
              COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
              COUNT(*) FILTER (WHERE status = 'SENT') AS sent,
              COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
          FROM notifications
      `);

      const stats = result.rows[0];
      logger.info("Notification statistics retrieved");
      res.json({
          total: Number(stats.total),
          pending: Number(stats.pending),
          processing: Number(stats.processing),
          sent: Number(stats.sent),
          failed: Number(stats.failed)
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
 * /notifications/{id}:
 *   get:
 *     summary: Get notification by ID
 *     description: Retrieves the details of a specific notification using its unique notification ID.
 *     tags:
 *       - Notifications
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Unique notification ID.
 *         schema:
 *           type: string
 *           format: uuid
 *           example: 0d35e70f-1522-421a-ad01-cbf02b0b9085
 *     responses:
 *       200:
 *         description: Notification retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: 0d35e70f-1522-421a-ad01-cbf02b0b9085
 *                 recipient:
 *                   type: string
 *                   example: user@example.com
 *                 channel:
 *                   type: string
 *                   example: EMAIL
 *                 event_type:
 *                   type: string
 *                   example: ORDER_PLACED
 *                 status:
 *                   type: string
 *                   example: SENT
 *                 failure_reason:
 *                   type: string
 *                   nullable: true
 *                   example: Notification provider unavailable
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 failed_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       404:
 *         description: Notification not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Notification not found
 *       500:
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Internal Server Error
 */
  router.get("/:id", apiKeyAuth, async (req, res) => {
    try {
      const { id } = req.params;
  
      const result = await pool.query(
        `
          SELECT
            id,
            recipient,
            channel,
            event_type,
            status,
            failure_reason,
            created_at,
            failed_at
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
  
      res.json(result.rows[0]);
  
    } catch (err) {
      console.error(err);
  
      res.status(500).json({
        error: "Internal Server Error",
      });
    }
  });
 
module.exports = router;
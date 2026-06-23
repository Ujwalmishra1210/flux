const express = require("express");

const crypto = require("crypto");
const pool = require("../db/postgres");
const notificationQueue =
    require("../queue/notificationQueue");
const router = express.Router();

router.post("/", async (req, res) => {

    try {

        const {
            eventType,
            recipient,
            channel
        } = req.body;

        const id = crypto.randomUUID();

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
              notificationId: id
            },
            {
              attempts: 3,
              backoff: {
                type: "exponential",
                delay: 2000
              }
            }
          );
        res.status(201).json({
            id,
            message:
                "Notification created"
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Internal Server Error"
        });

    }

});

module.exports = router;
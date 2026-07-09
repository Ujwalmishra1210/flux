require("dotenv").config();

const express = require("express");
const pool = require("./db/postgres");
const notificationRoutes =
    require("./routes/notificationRoutes");
    const rateLimiter = require("./middleware/rateLimiter");
    const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
const { client } = require("./metrics");
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  if (req.path === "/metrics") {
    return next();
  }

  rateLimiter(req, res, next);
});
app.use(
    "/notifications",
    notificationRoutes
);
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);
app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("DB Error");
  }
});
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});
module.exports = app;
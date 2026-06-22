require("dotenv").config();

const express = require("express");
const pool = require("./db/postgres");
const notificationRoutes =
    require("./routes/notificationRoutes");
const app = express();

app.use(express.json());
app.use(
    "/notifications",
    notificationRoutes
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

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
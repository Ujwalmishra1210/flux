const client = require("prom-client");

client.collectDefaultMetrics();

const notificationCounter = new client.Counter({
  name: "flux_notifications_created_total",
  help: "Total number of notifications created"
});

module.exports = {
  client,
  notificationCounter
};
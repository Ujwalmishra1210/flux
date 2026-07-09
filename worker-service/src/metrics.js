const client = require("prom-client");

client.collectDefaultMetrics();

const notificationsSentCounter = new client.Counter({
  name: "flux_notifications_sent_total",
  help: "Total notifications successfully processed"
});

const notificationsFailedCounter = new client.Counter({
  name: "flux_notifications_failed_total",
  help: "Total notifications permanently failed"
});

module.exports = {
  client,
  notificationsSentCounter,
  notificationsFailedCounter
};
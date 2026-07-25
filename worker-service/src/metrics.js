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

const queueWaitingGauge = new client.Gauge({
  name: "flux_queue_waiting_jobs",
  help: "Number of waiting jobs"
});

const queueActiveGauge = new client.Gauge({
  name: "flux_queue_active_jobs",
  help: "Number of active jobs"
});

const queueDelayedGauge = new client.Gauge({
  name: "flux_queue_delayed_jobs",
  help: "Number of delayed jobs"
});

const queueCompletedGauge = new client.Gauge({
  name: "flux_queue_completed_jobs",
  help: "Number of completed jobs"
});

const queueFailedGauge = new client.Gauge({
  name: "flux_queue_failed_jobs",
  help: "Number of failed jobs"
});

const deadLetterQueueGauge = new client.Gauge({
  name: "flux_dead_letter_queue_jobs",
  help: "Number of jobs in dead letter queue"
});

module.exports = {
  client,
  
  notificationsSentCounter,
  notificationsFailedCounter,
  queueWaitingGauge,
  queueActiveGauge,
  queueDelayedGauge,
  queueCompletedGauge,
  queueFailedGauge,
  deadLetterQueueGauge
};
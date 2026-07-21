const pool = require("../db/postgres");

async function getTemplate(eventType, channel) {
  const result = await pool.query(
    `
    SELECT subject, body
    FROM notification_templates
    WHERE event_type = $1
      AND channel = $2
    `,
    [eventType, channel]
  );

  if (result.rowCount === 0) {
    throw new Error("Notification template not found");
  }

  return result.rows[0];
}

function renderTemplate(template, data = {}) {
  let output = template;

  for (const [key, value] of Object.entries(data)) {
    output = output.replaceAll(`{{${key}}}`, String(value));
  }

  return output;
}

module.exports = {
  getTemplate,
  renderTemplate
};
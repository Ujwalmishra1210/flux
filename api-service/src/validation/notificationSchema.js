const Joi = require("joi");

const notificationSchema = Joi.object({
  eventType: Joi.string().trim().required(),

  recipient: Joi.string().email().required(),

  channel: Joi.string()
    .valid("EMAIL", "SMS", "PUSH")
    .required()
});

module.exports = notificationSchema;
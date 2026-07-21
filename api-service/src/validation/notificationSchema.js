const Joi = require("joi");

const notificationSchema = Joi.object({
  eventType: Joi.string().trim().required(),

  recipient: Joi.alternatives().conditional("channel", {
    switch: [
      {
        is: "EMAIL",
        then: Joi.string().email().required()
      },
      {
        is: "SMS",
        then: Joi.string()
          .pattern(/^\+?[1-9]\d{7,14}$/)
          .required()
      },
      {
        is: "PUSH",
        then: Joi.string().min(10).required()
      }
    ]
  }),

  channel: Joi.string()
    .valid("EMAIL", "SMS", "PUSH")
    .required(),

  data: Joi.object().default({})
});

module.exports = notificationSchema;
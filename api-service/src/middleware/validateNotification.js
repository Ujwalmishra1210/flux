const notificationSchema = require("../validation/notificationSchema");
const logger = require("../logger");

module.exports = (req, res, next) => {

    const { error } = notificationSchema.validate(req.body, {
        abortEarly: false
      });

  if (error) {

    const errors = error.details.map(detail => detail.message);

    logger.warn("Request validation failed", {
      errors,
      body: req.body
    });
    
    return res.status(400).json({
      error: "Validation failed",
      details: errors
    });
  }

  next();
};
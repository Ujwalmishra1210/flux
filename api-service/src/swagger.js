const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "Flux Notification API",
      version: "1.0.0",
      description: "Notification service built with Express, BullMQ, Redis and PostgreSQL."
    },

    servers: [
      {
        url: "http://localhost:3000"
      }
    ]
  },

  apis: ["./src/routes/*.js"]
};

module.exports = swaggerJsdoc(options);
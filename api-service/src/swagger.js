const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "Flux Notification API",
      version: "1.0.0",
      description:
        "Notification service built with Express, BullMQ, Redis and PostgreSQL."
    },

    servers: [
      {
        url: "http://localhost:3000"
      }
    ],

    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key"
        }
      }
    }
  },

  apis: ["./src/routes/*.js"]
};

module.exports = swaggerJsdoc(options);
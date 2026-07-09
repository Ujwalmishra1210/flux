const request = require("supertest");
const app = require("../src/app");

const validNotification = {
  eventType: "ORDER_PLACED",
  recipient: "user@example.com",
  channel: "EMAIL"
};
describe("Notification API", () => {
 

  test("POST /notifications without API key should return 401", async () => {
    const response = await request(app)
      .post("/notifications")
      .send(validNotification);
  
    expect(response.statusCode).toBe(401);
  
    expect(response.body).toEqual({
      error: "API key is required"
    });
  });

  test("POST /notifications with invalid API key should return 401", async () => {
    const response = await request(app)
      .post("/notifications")
      .set("x-api-key", "wrong_key")
      .send(validNotification);
  
    expect(response.statusCode).toBe(401);
  
    expect(response.body).toEqual({
      error: "Invalid API key"
    });
  });

  test("POST /notifications with valid API key should return 201", async () => {
    const response = await request(app)
      .post("/notifications")
      .set("x-api-key", process.env.API_KEY)
      .send(validNotification);
  
    expect(response.statusCode).toBe(201);
  
    expect(response.body).toHaveProperty("id");
    expect(response.body).toHaveProperty("correlationId");
    expect(response.body.message).toBe("Notification created");
  });

  test("POST /notifications with invalid channel should return 400", async () => {
    const response = await request(app)
      .post("/notifications")
      .set("x-api-key", process.env.API_KEY)
      .send({
        ...validNotification,
        channel: "WHATSAPP"
      });
  
    expect(response.statusCode).toBe(400);
  
    expect(response.body).toHaveProperty("error");
  });
  test("POST /notifications without recipient should return 400", async () => {
    const invalidNotification = {
      ...validNotification
    };
  
    delete invalidNotification.recipient;
  
    const response = await request(app)
      .post("/notifications")
      .set("x-api-key", process.env.API_KEY)
      .send(invalidNotification);
  
    expect(response.statusCode).toBe(400);
  
    expect(response.body).toHaveProperty("error");
  });

  test("POST /notifications without eventType should return 400", async () => {
    const invalidNotification = {
      ...validNotification
    };
  
    delete invalidNotification.eventType;
  
    const response = await request(app)
      .post("/notifications")
      .set("x-api-key", process.env.API_KEY)
      .send(invalidNotification);
  
    expect(response.statusCode).toBe(400);
  
    expect(response.body).toHaveProperty("error");
  });

  test("POST /notifications with empty body should return 400", async () => {
    const response = await request(app)
      .post("/notifications")
      .set("x-api-key", process.env.API_KEY)
      .send({});
  
    expect(response.statusCode).toBe(400);
  
    expect(response.body).toHaveProperty("error");
  });
});



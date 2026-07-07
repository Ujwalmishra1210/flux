const request = require("supertest");
const app = require("../src/app");

describe("Health API", () => {
  test("GET /notifications/health should return 200", async () => {
    const response = await request(app)
      .get("/notifications/health");

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("OK");
    expect(response.body.database).toBe(true);
    expect(response.body.redis).toBe(true);
  });
});
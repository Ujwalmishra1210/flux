const axios = require("axios");

const API = "http://localhost:3000/notifications";

const headers = {
  "x-api-key": "flux_5dN9xQ2mL7vK8pR1cT4zY6wH3sB0eA"
};

function randomOrderId() {
  return `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
}

function randomEmail() {
  return `user${Math.floor(Math.random() * 100000)}@gmail.com`;
}

function randomPhone() {
  return `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`;
}

function randomDeviceToken() {
  return `device-token-${Math.random().toString(36).substring(2, 18)}`;
}

const emailPayload = () => ({
  eventType: "ORDER_PLACED",
  recipient: randomEmail(),
  channel: "EMAIL",
  data: {
    name: "Ujwal",
    orderId: randomOrderId()
  }
});

const smsPayload = () => ({
  eventType: "ORDER_PLACED",
  recipient: randomPhone(),
  channel: "SMS",
  data: {
    name: "Ujwal",
    orderId: randomOrderId()
  }
});

const pushPayload = () => ({
  eventType: "ORDER_PLACED",
  recipient: randomDeviceToken(),
  channel: "PUSH",
  data: {
    name: "Ujwal",
    orderId: randomOrderId()
  }
});

const payloadGenerators = [
  emailPayload,
  smsPayload,
  pushPayload
];

async function sendNotification(id) {
  let payload;

  try {
    payload =
      payloadGenerators[
        Math.floor(Math.random() * payloadGenerators.length)
      ]();

    const response = await axios.post(
      API,
      payload,
      { headers }
    );

    console.log(
      `✔ ${id} | ${payload.channel} | ${response.data.id}`
    );

  } catch (err) {

    console.log(
      `✖ ${id} | ${payload ? payload.channel : "UNKNOWN"}`
    );

    if (err.response) {
      console.log(err.response.status);
      console.log(err.response.data);
    } else {
      console.log(err.message);
    }
  }
}

async function main() {
  const TOTAL_REQUESTS = 200;
  const DELAY_MS = 100;

  console.log(`Sending ${TOTAL_REQUESTS} notifications...\n`);

  const promises = [];

  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    promises.push(sendNotification(i));

    await new Promise(resolve =>
      setTimeout(resolve, DELAY_MS)
    );
  }

  await Promise.all(promises);

  console.log("\nFinished sending notifications.");
}

main();
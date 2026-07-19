const NotificationProvider = require("./notificationProvider");

class SmsProvider extends NotificationProvider {
  async send(notification) {
    console.log("SMS provider called");
    const shouldFail = Math.random() < 0.5;

    if (shouldFail) {
      throw new Error("SMS provider unavailable");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    return true;
  }
}

module.exports = SmsProvider;
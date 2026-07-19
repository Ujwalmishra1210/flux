const NotificationProvider = require("./notificationProvider");

class PushProvider extends NotificationProvider {
  async send(notification) {
    console.log("PUSH provider called");
    const shouldFail = Math.random() < 0.5;

    if (shouldFail) {
      throw new Error("Push provider unavailable");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    return true;
  }
}

module.exports = PushProvider;
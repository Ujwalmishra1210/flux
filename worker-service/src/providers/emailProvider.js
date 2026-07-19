const NotificationProvider = require("./notificationProvider");

class EmailProvider extends NotificationProvider {
  async send(notification) {
    console.log("EMAIL provider called");   
    const shouldFail = Math.random() < 0.5;

    if (shouldFail) {
      throw new Error("Email provider unavailable");
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    return true;
  }
}

module.exports = EmailProvider;
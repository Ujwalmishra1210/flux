class NotificationProvider {
    async send(notification) {
      throw new Error("send() must be implemented");
    }
  }
  
  module.exports = NotificationProvider;
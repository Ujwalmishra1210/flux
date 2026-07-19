const EmailProvider = require("./emailProvider");
const SmsProvider = require("./smsProvider");
const PushProvider = require("./pushProvider");

function getProvider(channel) {
  switch (channel) {
    case "EMAIL":
      return new EmailProvider();

    case "SMS":
      return new SmsProvider();

    case "PUSH":
      return new PushProvider();

    default:
      throw new Error(`Unsupported notification channel: ${channel}`);
  }
}

module.exports = {
  getProvider
};
const EmailProvider = require("./emailProvider");
const SmsProvider = require("./smsProvider");
const PushProvider = require("./pushProvider");

const providers = {
  EMAIL: new EmailProvider(),
  SMS: new SmsProvider(),
  PUSH: new PushProvider()
};

function getProvider(channel) {
  const provider = providers[channel];

  if (!provider) {
    throw new Error(`Unsupported notification channel: ${channel}`);
  }

  return provider;
}

module.exports = {
  getProvider
};
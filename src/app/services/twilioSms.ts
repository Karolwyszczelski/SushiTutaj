// services/twilioSms.js
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID; // Ustaw w .env
const authToken  = process.env.TWILIO_AUTH_TOKEN;    // Ustaw w .env
const fromNumber = process.env.TWILIO_PHONE_NUMBER;   // Ustaw w .env

const client = twilio(accountSid, authToken);

async function sendSms(to, message) {
  try {
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to,
    });
    console.log('SMS wysłany:', result.sid);
    return result;
  } catch (error) {
    console.error('Błąd wysyłki SMS:', error);
    throw error;
  }
}

module.exports = { sendSms };

const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../utils/telegramBot');
const { getWhatsAppConfig } = require('../utils/whatsapp');
const { processWhatsAppMessage } = require('../utils/whatsappBot');

router.post('/webhook/telegram', handleWebhook);

router.post('/webhook/whatsapp', async (req, res) => {
  try {
    const config = getWhatsAppConfig();
    if (!config.enabled) return res.sendStatus(200);

    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      if (body.entry && body.entry[0] && body.entry[0].changes) {
        const change = body.entry[0].changes[0];
        if (change.value && change.value.messages) {
          for (const msg of change.value.messages) {
            const from = msg.from;
            const text = msg.text ? msg.text.body : '';
            console.log('WhatsApp message received:', from, text || '(no text)');
            await processWhatsAppMessage(from, text);
          }
        }
        if (change.value && change.value.statuses) {
          for (const status of change.value.statuses) {
            console.log('WhatsApp status update:', status.id, status.status);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('WhatsApp webhook error:', err.message);
    res.sendStatus(200);
  }
});

router.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;

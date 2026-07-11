const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');

let client = null;
let isReady = false;
let qrCodeData = null;

const SESSION_DIR = path.join(__dirname, '..', '.wwebjs_auth');

function initClient() {
  if (client) return;

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });

  client.on('qr', async (qr) => {
    qrCodeData = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
    console.log('WhatsApp QR generated. Scan with WhatsApp to authenticate.');
  });

  client.on('ready', () => {
    isReady = true;
    qrCodeData = null;
    console.log('WhatsApp client is ready!');
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.log('WhatsApp client disconnected:', reason);
  });

  client.on('auth_failure', (msg) => {
    console.error('WhatsApp auth failure:', msg);
  });

  client.initialize().catch(err => console.error('WhatsApp init error:', err.message));
}

async function sendMessage(to, message) {
  if (!client) initClient();
  if (!isReady) {
    console.log('WhatsApp not ready yet. QR needed for first-time setup.');
    return { ok: false, qr: qrCodeData, message: 'WhatsApp belum siap. Scan QR code terlebih dahulu.' };
  }
  try {
    const chatId = to.includes('@c.us') ? to : to + '@c.us';
    await client.sendMessage(chatId, message);
    return { ok: true };
  } catch (err) {
    console.error('WhatsApp send error:', err.message);
    return { ok: false, message: err.message };
  }
}

function getStatus() {
  return { ready: isReady, qr: qrCodeData };
}

module.exports = { initClient, sendMessage, getStatus };

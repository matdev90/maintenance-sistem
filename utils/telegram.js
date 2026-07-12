const axios = require('axios');

function getTelegramConfig() {
  return {
    enabled: process.env.TELEGRAM_ENABLED === 'true',
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || ''
  };
}

function formatStatus(status) {
  const map = {
    'dilaporkan': 'Dilaporkan',
    'divalidasi': 'Divalidasi',
    'investigasi': 'Investigasi',
    'dalam_perbaikan': 'Dalam Perbaikan',
    'selesai': 'Selesai',
    'tidak_dapat_diperbaiki': 'Tidak Dapat Diperbaiki',
    'tidak_valid': 'Tidak Valid'
  };
  return map[status] || status;
}

async function sendTelegramNotification(message) {
  try {
    const { enabled, botToken, chatId } = getTelegramConfig();
    if (!enabled || !botToken || !chatId) return;

    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    }, { timeout: 10000 });
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}

async function testTelegramConnection() {
  const { enabled, botToken, chatId } = getTelegramConfig();
  if (!botToken) return { ok: false, message: 'Bot token belum diisi' };
  if (!chatId) return { ok: false, message: 'Chat ID belum diisi' };

  try {
    const res = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: '✅ Koneksi Telegram SIMRS Maintenance berhasil!',
      parse_mode: 'HTML'
    }, { timeout: 10000 });
    return { ok: true, message: 'Pesan test berhasil dikirim ke Telegram' };
  } catch (err) {
    const detail = err.response && err.response.data ? err.response.data.description : err.message;
    return { ok: false, message: 'Gagal: ' + detail };
  }
}

async function notifyLaporanBaru(report, pelaporNama, unitNama) {
  const msg = `<b>LAPORAN BARU</b>\n\n`
    + `<b>Unit:</b> ${unitNama}\n`
    + `<b>Pelapor:</b> ${pelaporNama}\n`
    + `<b>Perangkat:</b> ${report.nama_perangkat}\n`
    + `<b>Prioritas:</b> ${report.prioritas.toUpperCase()}\n`
    + `<b>Deskripsi:</b> ${report.deskripsi || '-'}\n\n`
    + `ID Laporan: #${report.id}`;
  await sendTelegramNotification(msg);
}

async function notifyStatusChange(report, pelaporNama, unitNama) {
  const msg = `<b>UPDATE LAPORAN #${report.id}</b>\n\n`
    + `<b>Unit:</b> ${unitNama}\n`
    + `<b>Perangkat:</b> ${report.nama_perangkat}\n`
    + `<b>Status:</b> ${formatStatus(report.status)}\n`
    + `<b>Prioritas:</b> ${report.prioritas.toUpperCase()}\n\n`
    + `<i>Oleh: ${pelaporNama}</i>`;
  await sendTelegramNotification(msg);
}

module.exports = { sendTelegramNotification, testTelegramConnection, notifyLaporanBaru, notifyStatusChange, getTelegramConfig };

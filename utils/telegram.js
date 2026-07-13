const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { TechnicianProfile, User } = require('../models');
const { Op } = require('sequelize');

function getTelegramConfig() {
  return {
    enabled: process.env.TELEGRAM_ENABLED === 'true',
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    notifyMode: process.env.TELEGRAM_NOTIFY_MODE || 'group'
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

async function sendTelegramPhoto(chatId, photoPath, caption) {
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken || !photoPath) return null;

    const fullPath = path.join(__dirname, '..', 'public', 'uploads', photoPath);
    if (!fs.existsSync(fullPath)) return null;

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', fs.createReadStream(fullPath));
    if (caption) form.append('caption', caption);
    form.append('parse_mode', 'HTML');

    const resp = await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });
    return resp.data && resp.data.result ? resp.data.result.message_id : null;
  } catch (err) {
    const detail = err.response && err.response.data ? err.response.data.description : err.message;
    console.error('[TG Photo] Error for chat_id:', chatId, '|', detail);
    return null;
  }
}

async function sendTelegramDMPhotos(photoPath, caption) {
  const sentMessages = [];
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken || !photoPath) return sentMessages;

    const fullPath = path.join(__dirname, '..', 'public', 'uploads', photoPath);
    if (!fs.existsSync(fullPath)) return sentMessages;

    const profiles = await TechnicianProfile.findAll({
      where: { telegram_chat_id: { [Op.ne]: null, [Op.ne]: '' } }
    });

    for (const profile of profiles) {
      try {
        const msgId = await sendTelegramPhoto(String(profile.telegram_chat_id), photoPath, caption);
        if (msgId) sentMessages.push({ chat_id: String(profile.telegram_chat_id), message_id: msgId });
      } catch (err) {
        console.error('[TG DM Photo] FAILED for id_user:', profile.id_user, err.message);
      }
    }
  } catch (err) {
    console.error('[TG DM Photo] error:', err.message);
  }
  return sentMessages;
}

async function sendTelegramNotification(message) {
  const sentMessages = [];
  try {
    const config = getTelegramConfig();
    console.log("[TG Config] enabled:", config.enabled, "token:", config.botToken ? config.botToken.substring(0,10)+"..." : "none");
    const { enabled, botToken, chatId, notifyMode } = config;
    console.log('[TG Notify] mode:', notifyMode, 'enabled:', enabled, 'hasBotToken:', !!botToken, 'chatId:', chatId);
    if (!enabled || !botToken) return sentMessages;

    if (notifyMode === 'dm') {
      console.log('[TG Notify] Mode DM -> sending to all technicians');
      const dmResult = await sendTelegramDMToTechnicians(message);
      sentMessages.push(...dmResult);
      return sentMessages;
    }

    if ((notifyMode === 'group' || notifyMode === 'both') && chatId) {
      console.log('[TG Notify] Mode', notifyMode, '-> sending to group chatId:', chatId);
      const resp = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      }, { timeout: 10000 });
      const msgId = resp.data && resp.data.result ? resp.data.result.message_id : null;
      if (msgId) sentMessages.push({ chat_id: chatId, message_id: msgId });
    }

    if (notifyMode === 'both') {
      console.log('[TG Notify] Mode both -> also sending DM to all technicians');
      const dmResult = await sendTelegramDMToTechnicians(message);
      sentMessages.push(...dmResult);
    }
  } catch (err) {
    console.error('[TG Notify] error:', err.message);
  }
  return sentMessages;
}

async function sendTelegramDMToTechnicians(message) {
  const sentMessages = [];
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken) {
      console.error('[TG DM] Bot token not set');
      return sentMessages;
    }

    const profiles = await TechnicianProfile.findAll({
      where: { telegram_chat_id: { [Op.ne]: null, [Op.ne]: '' } }
    });

    console.log('[TG DM] Found', profiles.length, 'technician profiles with chat_id');
    profiles.forEach(p => console.log('[TG DM]   -> id_user:', p.id_user, 'chat_id:', p.telegram_chat_id));

    if (profiles.length === 0) return sentMessages;

    for (const profile of profiles) {
      try {
        console.log('[TG DM] Sending to id_user:', profile.id_user, 'chat_id:', profile.telegram_chat_id);
        const resp = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: profile.telegram_chat_id,
          text: message,
          parse_mode: 'HTML'
        }, { timeout: 10000 });
        const msgId = resp.data && resp.data.result ? resp.data.result.message_id : null;
        if (msgId) sentMessages.push({ chat_id: profile.telegram_chat_id, message_id: msgId });
        console.log('[TG DM] Sent OK to id_user:', profile.id_user, 'message_id:', msgId);
      } catch (err) {
        const detail = err.response && err.response.data ? err.response.data.description : err.message;
        console.error('[TG DM] FAILED for id_user:', profile.id_user, 'chat_id:', profile.telegram_chat_id, 'error:', detail);
      }
    }
  } catch (err) {
    console.error('[TG DM] General error:', err.message);
  }
  return sentMessages;
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
  console.log('[TG Laporan] New report #' + report.id + ', calling sendTelegramNotification');
  const msg = `<b>LAPORAN BARU</b>\n\n`
    + `<b>Unit:</b> ${unitNama}\n`
    + `<b>Pelapor:</b> ${pelaporNama}\n`
    + `<b>Perangkat:</b> ${report.nama_perangkat}\n`
    + `<b>Prioritas:</b> ${report.prioritas.toUpperCase()}\n`
    + `<b>Deskripsi:</b> ${report.deskripsi || '-'}\n\n`
    + `ID Laporan: #${report.id}`;

  let sentMessages = [];
  if (report.foto) {
    console.log('[TG Laporan] Report has photo, sending photo to all technicians');
    sentMessages = await sendTelegramDMPhotos(report.foto, msg);
  } else {
    sentMessages = await sendTelegramNotification(msg);
  }

  if (sentMessages.length > 0) {
    try {
      const { TelegramMessage } = require('../models');
      for (const m of sentMessages) {
        await TelegramMessage.create({ ref_type: 'report', ref_id: report.id, chat_id: m.chat_id, message_id: m.message_id });
      }
      console.log('[TG Laporan] Stored', sentMessages.length, 'message_ids for report #' + report.id);
    } catch (e) { console.error('[TG Laporan] Store message_ids error:', e.message); }
  }
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

async function deleteTelegramMessages(refType, refId) {
  try {
    const { TelegramMessage } = require('../models');
    const { botToken } = getTelegramConfig();
    if (!botToken) return;

    const messages = await TelegramMessage.findAll({
      where: { ref_type: refType, ref_id: refId }
    });

    if (messages.length === 0) return;

    console.log('[TG Delete] Found', messages.length, 'messages to delete for', refType, '#' + refId);
    for (const m of messages) {
      try {
        await axios.post(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
          chat_id: m.chat_id,
          message_id: m.message_id
        }, { timeout: 5000 });
        console.log('[TG Delete] Deleted message_id:', m.message_id, 'chat_id:', m.chat_id);
      } catch (err) {
        const detail = err.response && err.response.data ? err.response.data.description : err.message;
        console.error('[TG Delete] Failed to delete message_id:', m.message_id, 'error:', detail);
      }
    }

    await TelegramMessage.destroy({ where: { ref_type: refType, ref_id: refId } });
    console.log('[TG Delete] Cleaned up', messages.length, 'message records for', refType, '#' + refId);
  } catch (err) {
    console.error('[TG Delete] error:', err.message);
  }
}

module.exports = { sendTelegramNotification, sendTelegramDMToTechnicians, testTelegramConnection, notifyLaporanBaru, notifyStatusChange, deleteTelegramMessages, getTelegramConfig };

const axios = require('axios');
const { Op } = require('sequelize');
const { User, Unit, DeviceCategory, Report, Ticket, TicketHistory, ReportTracking, Notification, TechnicianProfile, TicketTechnician, Asset, Layanan } = require('../models');
const { getTelegramConfig } = require('./telegram');
const { generateTicketNumber, emitDisplayUpdate } = require('./helpers');
const { checkMaxTasks } = require('./activeTask');

const userSessions = new Map();

async function sendTelegramMessage(chatId, text, options = {}) {
  const { botToken } = getTelegramConfig();
  if (!botToken) return;
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        ...options
      }, { timeout: 10000 });
      return;
    } catch (err) {
      attempt++;
      if (err.response && err.response.status === 429) {
        const retryAfter = err.response.data?.parameters?.retry_after || 5;
        console.warn('[TG Send] Rate limited (429), retrying in', retryAfter, 'seconds (attempt', attempt, '/', maxRetries, ')');
        await new Promise(r => setTimeout(r, (retryAfter + 2) * 1000));
        continue;
      }
      if (attempt >= maxRetries) {
        console.error('Telegram send error:', err.message);
        return;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function sendTelegramPhoto(chatId, photo, caption) {
  const { botToken } = getTelegramConfig();
  if (!botToken) return;
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        chat_id: chatId,
        photo: photo,
        caption: caption,
        parse_mode: 'HTML'
      }, { timeout: 15000 });
      return;
    } catch (err) {
      attempt++;
      if (err.response && err.response.status === 429) {
        const retryAfter = err.response.data?.parameters?.retry_after || 5;
        console.warn('[TG Photo] Rate limited (429), retrying in', retryAfter, 'seconds (attempt', attempt, '/', maxRetries, ')');
        await new Promise(r => setTimeout(r, (retryAfter + 2) * 1000));
        continue;
      }
      if (attempt >= maxRetries) {
        console.error('Telegram photo error:', err.message);
        return;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function sendPhotoWithInlineKeyboard(chatId, photoPath, caption, buttons) {
  const { botToken } = getTelegramConfig();
  if (!botToken) return null;
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const fullPath = path.join(__dirname, '..', 'public', 'uploads', photoPath);
      if (!fs.existsSync(fullPath)) return null;

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('photo', fs.createReadStream(fullPath));
      if (caption) form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      if (buttons) form.append('reply_markup', JSON.stringify({ inline_keyboard: buttons }));

      const resp = await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, form, {
        headers: form.getHeaders(),
        timeout: 30000
      });
      return resp.data && resp.data.result ? resp.data.result.message_id : null;
    } catch (err) {
      attempt++;
      if (err.response && err.response.status === 429) {
        const retryAfter = err.response.data?.parameters?.retry_after || 5;
        console.warn('[TG PhotoKB] Rate limited (429), retrying in', retryAfter, 'seconds (attempt', attempt, '/', maxRetries, ')');
        await new Promise(r => setTimeout(r, (retryAfter + 2) * 1000));
        continue;
      }
      if (attempt >= maxRetries) {
        const detail = err.response && err.response.data ? err.response.data.description : err.message;
        console.error('[TG PhotoKB] Error for chat_id:', chatId, '|', detail);
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

async function sendInlineKeyboard(chatId, text, buttons) {
  const { botToken } = getTelegramConfig();
  if (!botToken) return null;
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const resp = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
      }, { timeout: 10000 });
      if (resp.data && resp.data.result) {
        return resp.data.result.message_id;
      }
      console.error('[TG Inline] Unexpected response for chat_id:', chat_id, JSON.stringify(resp.data));
      return null;
    } catch (err) {
      attempt++;
      if (err.response && err.response.status === 429) {
        const retryAfter = err.response.data?.parameters?.retry_after || 5;
        console.warn('[TG Inline] Rate limited (429), retrying in', retryAfter, 'seconds (attempt', attempt, '/', maxRetries, ')');
        await new Promise(r => setTimeout(r, (retryAfter + 2) * 1000));
        continue;
      }
      if (attempt >= maxRetries) {
        const detail = err.response && err.response.data ? err.response.data.description : err.message;
        console.error('[TG Inline] Error for chat_id:', chat_id, '|', detail);
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

async function answerCallbackQuery(callbackQueryId, text) {
  const { botToken } = getTelegramConfig();
  if (!botToken) return;
  
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: false
      }, { timeout: 5000 });
      return;
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const retryAfter = err.response.data?.parameters?.retry_after || 5;
        console.warn('[TG Callback] Rate limited (429), retrying in', retryAfter, 'seconds');
        await new Promise(r => setTimeout(r, (retryAfter + 2) * 1000));
        continue;
      }
      if (attempt >= maxRetries) {
        console.error('Telegram answerCallbackQuery error:', err.message);
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

async function processTelegramUpdate(update) {
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }
  if (!update.message) return;

  const msg = update.message;
  const messageId = msg.message_id;
  
  // Deduplicate regular messages (including /start commands)
  const dedupKey = `${chatId}:${messageId}`;
  if (!markMessageProcessed(dedupKey)) {
    console.log('[TG Message] Duplicate message ignored:', dedupKey);
    return;
  }

  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text || '';
  const photo = msg.photo ? msg.photo[msg.photo.length - 1] : null;

  // Look up user by TechnicianProfile.telegram_chat_id (from /register)
  const techProfile = await TechnicianProfile.findOne({
    where: { telegram_chat_id: String(chatId) },
    include: [{ model: User, as: 'user' }]
  });
  let user = techProfile ? techProfile.user : null;

  if (user) console.log('[TG] User found: id:', user.id, 'nama:', user.nama_lengkap, 'step:', (userSessions.get(chatId) || {}).step);
  // Fallback to legacy lookup by username 'tg_' + telegramId
  if (!user) {
    user = await User.findOne({
      where: { username: 'tg_' + telegramId },
      include: [{ model: TechnicianProfile, as: 'techProfile' }]
    });
  }

  if (!user) {
    console.log('[TG] User not found. chatId:', chatId, 'telegramId:', telegramId, 'text:', text ? text.substring(0,50) : '(photo)', 'session.step:', (userSessions.get(chatId) || {}).step);
    await sendTelegramMessage(chatId,
      'Anda belum terdaftar di sistem SIMRS Maintenance.\n'
      + 'Silakan hubungi admin untuk pendaftaran.\n\n'
      + 'Username: <code>tg_' + telegramId + '</code>'
    );
    return;
  }

  const session = userSessions.get(chatId) || { step: null, data: {} };

  if (text.startsWith('/register')) {
    const username = text.split(' ')[1];
    if (!username) {
      await sendTelegramMessage(chatId, 'Cara: <code>/register username_anda</code>\nContoh: /register teknisi1');
      return;
    }
    const user = await User.findOne({
      where: { username },
      include: [{ model: TechnicianProfile, as: 'techProfile' }]
    });
    if (!user) {
      await sendTelegramMessage(chatId, `User <b>${username}</b> tidak ditemukan.`);
      return;
    }
    if (user.role !== 'teknisi') {
      await sendTelegramMessage(chatId, `User <b>${username}</b> bukan teknisi.`);
      return;
    }
    let profile = user.techProfile;
    if (!profile) {
      profile = await TechnicianProfile.create({ id_user: user.id });
    }
    profile.telegram_chat_id = String(chatId);
    await profile.save();
    await sendTelegramMessage(chatId,
      `✅ Akun <b>${user.nama_lengkap}</b> berhasil terdaftar!\n\n`
      + `Sekarang Anda akan menerima notifikasi tiket baru dan bisa mengambil tugas langsung dari Telegram.`
    );
    return;
  }

  if (text === '/start' || text === '/batal') {
    userSessions.delete(chatId);
    await sendTelegramMessage(chatId,
      'Selamat datang di <b>SIMRS CareTrack Bot</b>!\n\n'
      + 'Perintah tersedia:\n'
      + '/register username - Hubungkan akun teknisi ke Telegram\n'
      + '/lapor - Lapor kerusakan perangkat\n'
      + '/tiket - Buat tiket IT support\n'
      + '/internal - Buat tiket internal (teknisi)\n'
      + '/status - Cek status laporan/tiket\n'
      + '/aset - Info aset (scan QR)\n'
      + '/batal - Batalkan proses saat ini\n\n'
      + 'Ketik pesan biasa untuk interaksi.'
    );
    return;
  }

  if (text === '/lapor') {
    session.step = 'pilih_unit';
    session.data = { type: 'report' };
    userSessions.set(chatId, session);

    const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
    let unitList = units.map((u, i) => `${i + 1}. ${u.nama_unit}`).join('\n');
    await sendTelegramMessage(chatId,
      '<b>LAPOR KERUSAKAN PERANGKAT</b>\n\n'
      + 'Pilih nomor unit lokasi kerusakan:\n\n'
      + unitList + '\n\n'
      + 'Ketik nomor unit atau /batal untuk membatalkan.'
    );
    return;
  }

  if (text === '/tiket') {
    session.step = 'tiket_subjek';
    session.data = { type: 'ticket' };
    userSessions.set(chatId, session);
    await sendTelegramMessage(chatId,
      '<b>BUAT TIKET IT SUPPORT</b>\n\n'
      + 'Masukkan subjek masalah:\n'
      + '(Ketik /batal untuk membatalkan)'
    );
    return;
  }

  if (text === '/internal') {
    // Only for teknisi
    if (user.role !== 'teknisi') {
      await sendTelegramMessage(chatId, 'Perintah ini hanya untuk teknisi.');
      return;
    }
    session.step = 'internal_subjek';
    session.data = { type: 'internal', id_unit: user.id_unit };
    userSessions.set(chatId, session);
    await sendTelegramMessage(chatId,
      '<b>BUAT TIKET INTERNAL</b>\n\n'
      + 'Masukkan subjek masalah:\n'
      + '(Ketik /batal untuk membatalkan)'
    );
    return;
  }

  if (text === '/internal') {
    if (user.role !== 'teknisi') {
      await sendTelegramMessage(chatId, 'Perintah ini hanya untuk teknisi.');
      return;
    }
    session.step = 'internal_subjek';
    session.data = { type: 'internal', id_teknisi: user.id };
    userSessions.set(chatId, session);
    await sendTelegramMessage(chatId,
      '<b>🔧 BUAT TIKET INTERNAL</b>\n\n'
      + 'Tiket akan langsung di-assign ke Anda (status: Dalam Pengerjaan).\n\n'
      + 'Masukkan subjek masalah:\n'
      + '(Ketik /batal untuk membatalkan)'
    );
    return;
  }

  if (text === '/status') {
    const reports = await Report.findAll({
      where: { id_pelapor: user.id, status: { [Op.notIn]: ['selesai', 'tidak_valid', 'tidak_dapat_diperbaiki'] } },
      include: [{ model: Unit, as: 'unit' }],
      order: [['created_at', 'DESC']],
      limit: 5
    });
    const tickets = await Ticket.findAll({
      where: { id_pelapor: user.id, status: { [Op.notIn]: ['resolved', 'closed'] } },
      include: [{ model: Unit, as: 'unit' }],
      order: [['created_at', 'DESC']],
      limit: 5
    });

    let response = '<b>STATUS AKTIF ANDA</b>\n\n';
    if (reports.length) {
      response += '<b>Laporan Kerusakan:</b>\n';
      reports.forEach(r => {
        response += `• #${r.id} | ${r.nama_perangkat} | ${r.status.replace(/_/g, ' ')}\n`;
      });
      response += '\n';
    }
    if (tickets.length) {
      response += '<b>Tiket IT Support:</b>\n';
      tickets.forEach(t => {
        response += `• ${t.no_tiket} | ${t.subjek} | ${t.status}\n`;
      });
      response += '\n';
    }
    if (!reports.length && !tickets.length) {
      response += 'Tidak ada laporan/tiket aktif.';
    }
    await sendTelegramMessage(chatId, response);
    return;
  }

  if (text === '/aset') {
    session.step = 'aset_scan';
    session.data = {};
    userSessions.set(chatId, session);
    await sendTelegramMessage(chatId,
      '<b>INFO ASET</b>\n\n'
      + 'Kirim foto QR Code yang tertempel pada perangkat, atau ketik kode aset manual.\n'
      + '(Ketik /batal untuk membatalkan)'
    );
    return;
  }

  if (session.step) {
    await handleSessionStep(chatId, session, text, photo, user);
    return;
  }

  await sendTelegramMessage(chatId,
    'Gunakan /lapor untuk lapor kerusakan atau /tiket untuk tiket IT support.\n'
    + 'Ketik /start untuk melihat semua perintah.'
  );
}

async function handleSessionStep(chatId, session, text, photo, user) {
  const { step, data } = session;

  switch (step) {
    case 'pilih_unit': {
      const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
      const idx = parseInt(text) - 1;
      if (isNaN(idx) || idx < 0 || idx >= units.length) {
        await sendTelegramMessage(chatId, 'Nomor tidak valid. Ketik nomor yang benar atau /batal.');
        return;
      }
      data.id_unit = units[idx].id;
      data.nama_unit = units[idx].nama_unit;
      session.step = 'pilih_kategori';
      userSessions.set(chatId, session);

      const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
      let catList = categories.map((c, i) => `${i + 1}. ${c.nama_kategori}`).join('\n');
      await sendTelegramMessage(chatId,
        `Unit: <b>${data.nama_unit}</b>\n\n`
        + 'Pilih kategori perangkat:\n\n'
        + catList + '\n\n'
        + 'Ketik nomor kategori.'
      );
      return;
    }

    case 'pilih_kategori': {
      const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
      const idx = parseInt(text) - 1;
      if (isNaN(idx) || idx < 0 || idx >= categories.length) {
        await sendTelegramMessage(chatId, 'Nomor tidak valid. Ketik nomor yang benar atau /batal.');
        return;
      }
      data.id_kategori = categories[idx].id;
      data.nama_kategori = categories[idx].nama_kategori;
      session.step = 'nama_perangkat';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        `Kategori: <b>${data.nama_kategori}</b>\n\n`
        + 'Masukkan nama/spesifikasi perangkat:\n'
        + '(Contoh: "Printer Canon iP2770" atau "PC Administrasi")'
      );
      return;
    }

    case 'nama_perangkat': {
      data.nama_perangkat = text.trim();
      session.step = 'deskripsi';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        `Perangkat: <b>${data.nama_perangkat}</b>\n\n`
        + 'Jelaskan kerusakan yang terjadi:\n'
        + '(Deskripsi singkat)'
      );
      return;
    }

    case 'deskripsi': {
      data.deskripsi = text.trim();
      session.step = 'prioritas';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        '<b>Pilih tingkat prioritas:</b>\n\n'
        + '1. Ringan (tidak mengganggu aktivitas)\n'
        + '2. Sedang (sedikit mengganggu)\n'
        + '3. Berat (mengganggu aktivitas)\n'
        + '4. Kritis (menghentikan aktivitas)\n\n'
        + 'Ketik nomor (1-4).'
      );
      return;
    }

    case 'prioritas': {
      const prioMap = { '1': 'ringan', '2': 'sedang', '3': 'berat', '4': 'kritis' };
      const prio = prioMap[text.trim()];
      if (!prio) {
        await sendTelegramMessage(chatId, 'Pilihan tidak valid. Ketik 1-4 atau /batal.');
        return;
      }
      data.prioritas = prio;

      try {
        const report = await Report.create({
          id_unit: data.id_unit,
          id_kategori: data.id_kategori,
          nama_perangkat: data.nama_perangkat,
          deskripsi: data.deskripsi,
          prioritas: data.prioritas,
          status: 'dilaporkan',
          id_pelapor: user.id
        });

        await ReportTracking.create({
          id_report: report.id,
          status: 'dilaporkan',
          catatan: 'Laporan dibuat via Telegram oleh ' + user.nama_lengkap,
          id_user: user.id
        });
        // Notify all teknisi without auto-assigning
        const teknisiList = await User.findAll({ where: { role: 'teknisi' } });
        for (const t of teknisiList) {
          await Notification.create({
            id_user: t.id,
            title: 'Laporan Baru #' + report.id,
            message: `${user.nama_lengkap} dari ${data.nama_unit} melaporkan: ${data.nama_perangkat}`,
            link: '/reports/' + report.id
          });
        }

        await sendTelegramMessage(chatId,
          `<b>LAPORAN BERHASIL DIBUAT</b> ✅\n\n`
          + `ID Laporan: <b>#${report.id}</b>\n`
          + `Unit: ${data.nama_unit}\n`
          + `Kategori: ${data.nama_kategori}\n`
          + `Perangkat: ${data.nama_perangkat}\n`
          + `Prioritas: ${prio.toUpperCase()}\n`
          + `Status: Dilaporkan\n\n`
          + 'Teknisi akan segera menangani laporan Anda.'
        );

      } catch (err) {
        console.error('Telegram report creation error:', err.message);
        await sendTelegramMessage(chatId, 'Terjadi kesalahan saat membuat laporan. Silakan coba lagi.');
      }

      userSessions.delete(chatId);
      return;
    }

    case 'tiket_subjek': {
      data.subjek = text.trim();
      session.step = 'tiket_kategori';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        `Subjek: <b>${data.subjek}</b>\n\n`
        + 'Pilih kategori masalah:\n'
        + '1. Hardware\n'
        + '2. Software\n'
        + '3. Jaringan\n'
        + '4. Akun\n'
        + '5. Lainnya\n\n'
        + 'Ketik nomor (1-5).'
      );
      return;
    }

    case 'tiket_kategori': {
      const kategoriMap = { '1': 'hardware', '2': 'software', '3': 'jaringan', '4': 'akun', '5': 'lainnya' };
      const kategori = kategoriMap[text.trim()];
      if (!kategori) {
        await sendTelegramMessage(chatId, 'Pilihan tidak valid. Ketik 1-5 atau /batal.');
        return;
      }
      data.kategori = kategori;
      session.step = 'tiket_deskripsi';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        `Kategori: <b>${kategori}</b>\n\n`
        + 'Jelaskan masalah yang dialami:\n'
        + '(Deskripsi singkat)'
      );
      return;
    }

    case 'tiket_deskripsi': {
      data.deskripsi = text.trim();
      session.step = 'tiket_prioritas';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        '<b>Pilih tingkat prioritas:</b>\n\n'
        + '1. Rendah\n'
        + '2. Sedang\n'
        + '3. Tinggi\n'
        + '4. Kritis\n\n'
        + 'Ketik nomor (1-4).'
      );
      return;
    }

    case 'tiket_prioritas': {
      const prioMap = { '1': 'rendah', '2': 'sedang', '3': 'tinggi', '4': 'kritis' };
      const prioritas = prioMap[text.trim()];
      if (!prioritas) {
        await sendTelegramMessage(chatId, 'Pilihan tidak valid. Ketik 1-4 atau /batal.');
        return;
      }
      data.prioritas = prioritas;

      try {
        const no_tiket = await generateTicketNumber();

        const ticket = await Ticket.create({
          no_tiket,
          subjek: data.subjek,
          deskripsi: data.deskripsi,
          kategori: data.kategori,
          prioritas: data.prioritas,
          sumber: 'telegram',
          id_pelapor: user.id,
          id_unit: user.id_unit || null,
          status: 'open'
        });

        await TicketHistory.create({
          id_ticket: ticket.id,
          status: 'open',
          catatan: 'Tiket dibuat via Telegram oleh ' + user.nama_lengkap,
          id_user: user.id
        });

        await TicketHistory.create({
          id_ticket: ticket.id,
          status: 'open',
          catatan: 'Tiket dibuat via Telegram oleh ' + user.nama_lengkap,
          id_user: user.id
        });

        // Notify all teknisi without auto-assigning
        const teknisiList = await User.findAll({ where: { role: 'teknisi' } });
        const admins = await User.findAll({ where: { role: 'admin' } });
        const allNotify = [...teknisiList, ...admins];
        for (const u of allNotify) {
          await Notification.create({
            id_user: u.id,
            title: 'Tiket Baru ' + no_tiket,
            message: user.nama_lengkap + ': ' + ticket.subjek,
            link: '/tickets/' + ticket.id
          });
        }

        await sendTelegramMessage(chatId,
          `<b>TIKET BERHASIL DIBUAT</b> ✅\n\n`
          + `No. Tiket: <b>${no_tiket}</b>\n`
          + `Subjek: ${data.subjek}\n`
          + `Kategori: ${data.kategori}\n`
          + `Prioritas: ${prioritas.toUpperCase()}\n`
          + `Status: Open\n\n`
          + 'Teknisi akan segera menangani tiket Anda.'
        );
      } catch (err) {
        console.error('Telegram ticket creation error:', err.message);
        await sendTelegramMessage(chatId, 'Terjadi kesalahan saat membuat tiket. Silakan coba lagi.');
      }

      userSessions.delete(chatId);
      return;
    }

    case 'internal_subjek': {
      data.subjek = text.trim();
      session.step = 'internal_kategori';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        `Subjek: <b>${data.subjek}</b>\n\n`
        + 'Pilih kategori:\n'
        + '1. Hardware\n'
        + '2. Software\n'
        + '3. Jaringan\n'
        + '4. TV Kabel\n'
        + '5. Alat Kesehatan\n'
        + '6. Listrik\n'
        + '7. Properti\n'
        + '8. Lainnya\n\n'
        + 'Ketik nomor (1-8).'
      );
      return;
    }

    case 'internal_kategori': {
      const kategoriMap = { '1': 'hardware', '2': 'software', '3': 'jaringan', '4': 'tv_kabel', '5': 'alat_kesehatan', '6': 'listrik', '7': 'properti', '8': 'lainnya' };
      const kategori = kategoriMap[text.trim()];
      if (!kategori) {
        await sendTelegramMessage(chatId, 'Pilihan tidak valid. Ketik 1-8 atau /batal.');
        return;
      }
      data.kategori = kategori;
      session.step = 'internal_deskripsi';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        `Kategori: <b>${kategori}</b>\n\n`
        + 'Jelaskan masalah (opsional):\n'
        + '(Ketik "-" untuk skip)'
      );
      return;
    }

    case 'internal_deskripsi': {
      if (text.trim() !== '-') {
        data.deskripsi = text.trim();
      }
      session.step = 'internal_prioritas';
      userSessions.set(chatId, session);
      await sendTelegramMessage(chatId,
        '<b>Pilih prioritas:</b>\n\n'
        + '1. Rendah\n'
        + '2. Sedang\n'
        + '3. Tinggi\n'
        + '4. Kritis\n\n'
        + 'Ketik nomor (1-4).'
      );
      return;
    }

    case 'internal_prioritas': {
      console.log('[TG Internal] internal_prioritas handler called, text:', text, 'data:', JSON.stringify(session.data));
      const prioMap = { '1': 'rendah', '2': 'sedang', '3': 'tinggi', '4': 'kritis' };
      const prioritas = prioMap[text.trim()];
      if (!prioritas) {
        await sendTelegramMessage(chatId, 'Pilihan tidak valid. Ketik 1-4 atau /batal.');
        return;
      }
      data.prioritas = prioritas;

      try {
        const no_tiket = await generateTicketNumber();

        const ticket = await Ticket.create({
          no_tiket,
          subjek: data.subjek,
          deskripsi: data.deskripsi || '',
          kategori: data.kategori,
          prioritas: data.prioritas,
          sumber: 'telegram_internal',
          id_pelapor: user.id,
          id_unit: data.id_unit || user.id_unit || null,
          status: 'in_progress',
          id_teknisi: user.id
        });

        await TicketTechnician.create({
          id_ticket: ticket.id,
          id_user: user.id,
          role: 'utama',
          added_by: user.id,
          status: 'active'
        });

        await TicketHistory.create({
          id_ticket: ticket.id,
          status: 'in_progress',
          catatan: 'Tiket internal dibuat & dikerjakan oleh ' + user.nama_lengkap + ' via Telegram',
          id_user: user.id
        });

        await sendTelegramMessage(chatId,
          `<b>TIKET INTERNAL BERHASIL DIBUAT</b> ✅\n\n`
          + `No. Tiket: <b>${no_tiket}</b>\n`
          + `Subjek: ${data.subjek}\n`
          + `Kategori: ${data.kategori}\n`
          + `Prioritas: ${prioritas.toUpperCase()}\n`
          + `Status: <b>Dalam Pengerjaan</b> (Anda yang menangani)\n\n`
          + 'Tiket sudah auto-assign ke Anda. Langsung dikerjakan!'
        );

      } catch (err) {
        console.error('Internal ticket creation error:', err.message);
        await sendTelegramMessage(chatId, 'Terjadi kesalahan saat membuat tiket internal. Silakan coba lagi.');
      }

      userSessions.delete(chatId);
      return;
    }

    case 'aset_scan': {
      if (photo) {
        try {
          const { botToken } = getTelegramConfig();
          const fileInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`);
          const filePath = fileInfo.data.result.file_path;
          const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

          const assets = await Asset.findAll({
            include: [
              { model: Unit, as: 'unit' },
              { model: DeviceCategory, as: 'kategori' }
            ]
          });

          await sendTelegramMessage(chatId,
            'Foto QR Code diterima. Untuk scanning QR Code, '
            + 'silakan gunakan halaman web di aplikasi SIMRS Maintenance.\n\n'
            + 'Atau ketik kode aset secara manual (contoh: AST-0001).'
          );
        } catch (err) {
          await sendTelegramMessage(chatId, 'Gagal memproses foto. Ketik kode aset manual.');
        }
        return;
      }

      const kode = text.trim().toUpperCase();
      const asset = await Asset.findOne({
        where: { kode_asset: kode },
        include: [
          { model: Unit, as: 'unit' },
          { model: DeviceCategory, as: 'kategori' }
        ]
      });

      if (!asset) {
        await sendTelegramMessage(chatId, `Aset dengan kode <b>${kode}</b> tidak ditemukan.\nKetik kode lain atau /batal.`);
        return;
      }

      await sendTelegramMessage(chatId,
        `<b>INFO ASET: ${asset.kode_asset}</b>\n\n`
        + `Nama: ${asset.nama_perangkat}\n`
        + `Kategori: ${asset.kategori ? asset.kategori.nama_kategori : '-'}\n`
        + `Unit: ${asset.unit ? asset.unit.nama_unit : '-'}\n`
        + `Lokasi: ${asset.lokasi_detail || '-'}\n`
        + `Merk: ${asset.merk || '-'}\n`
        + `Model: ${asset.model || '-'}\n`
        + `Serial: ${asset.serial_number || '-'}\n`
        + `Kondisi: ${asset.kondisi.replace(/_/g, ' ')}\n`
        + `Tahun: ${asset.tahun_pembelian || '-'}\n\n`
        + 'Gunakan /lapor untuk melaporkan kerusakan pada aset ini.'
      );
        userSessions.delete(chatId);
      return;
    }

    case 'upload_foto_selesai': {
      const { ticketId, techUserId, msgId } = data;

      // Skip photo
      if (text && text.toLowerCase() === 'skip') {
        // Deduplicate skip message
        const skipMsgId = `skip_${chatId}_${ticketId}_${techUserId}`;
        if (!markMessageProcessed(skipMsgId)) {
          console.log('[TG Skip] Duplicate skip ignored:', skipMsgId);
          return;
        }
        userSessions.delete(chatId);
        const techUser = await User.findByPk(techUserId);
        await finalizeTicketFromTelegram(ticketId, techUser, chatId, msgId, null);
        
        // Send success confirmation to technician who completed
        await sendTelegramMessage(chatId,
          '✅ <b>Tugas Sudah Diselesaikan</b>\n\n'
          + `Tiket: <b>${ticketId}</b>\n`
          + `Status: <b>Selesai</b>\n\n`
          + 'Terima kasih telah menyelesaikan tugas ini.'
        );
        return;
      }

      // Expecting photo
      if (!photo) {
        await sendTelegramMessage(chatId,
          'Mohon kirim <b>foto</b> bukti perbaikan, atau ketik <b>skip</b> untuk tanpa foto.'
        );
        return;
      }

      // Download photo from Telegram
      try {
        const { botToken } = getTelegramConfig();
        const fileInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
          params: { file_id: photo.file_id },
          timeout: 10000
        });
        const filePath = fileInfo.data.result.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
        const ext = path.extname(filePath) || '.jpg';
        const filename = `telegram_foto_selesai_${ticketId}_${Date.now()}${ext}`;
        const destPath = path.join(__dirname, '..', 'public', 'uploads', filename);

        const response = await axios({ method: 'get', url: fileUrl, responseType: 'stream', timeout: 30000 });
        const writer = fs.createWriteStream(destPath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        console.log('[TG Photo] Downloaded foto_selesai:', filename);
        userSessions.delete(chatId);
        
        // Deduplicate by message ID to prevent duplicate processing on retries
        if (!markMessageProcessed(photo.file_id)) {
          console.log('[TG Photo] Duplicate photo message ignored:', photo.file_id);
          return;
        }
        
        const techUser = await User.findByPk(techUserId);
        await finalizeTicketFromTelegram(ticketId, techUser, chatId, msgId, filename);
        
        // Send success confirmation to technician who completed
        await sendTelegramMessage(chatId,
          '✅ <b>Tugas Sudah Diselesaikan</b>\n\n'
          + `Tiket: <b>${ticketId}</b>\n`
          + `Status: <b>Selesai</b>\n\n`
          + 'Terima kasih telah menyelesaikan tugas ini.'
        );
      } catch (err) {
        console.error('[TG Photo] Download error:', err.message);
        await sendTelegramMessage(chatId, 'Gagal mengunduh foto. Ketik <b>skip</b> atau kirim ulang foto.');
      }
      return;
    }

    default:
      userSessions.delete(chatId);
  }
}

async function finalizeTicketFromTelegram(ticketId, techUser, chatId, msgId, fotoFilename) {
  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) return;

    ticket.status = 'resolved';
    ticket.tgl_selesai = new Date();
    ticket.solusi = 'Diselesaikan via Telegram';
    if (fotoFilename) ticket.foto_selesai = fotoFilename;
    await ticket.save();

    await TicketHistory.create({
      id_ticket: ticket.id,
      status: 'resolved',
      catatan: 'Diselesaikan via Telegram oleh ' + techUser.nama_lengkap + (fotoFilename ? ' (dengan foto bukti)' : ''),
      id_user: techUser.id
    });

    const { broadcastNotification } = require('./socket');
    if (ticket.id_pelapor) {
      await broadcastNotification(ticket.id_pelapor, 'Tiket ' + ticket.no_tiket + ' Selesai',
        'Diselesaikan oleh ' + techUser.nama_lengkap, '/tickets/' + ticket.id);
    }

    emitDisplayUpdate(ticket.id, Ticket, 'kategoriDevice');

    // Update the clicked message
    try {
      const { botToken } = getTelegramConfig();
      const newText = `🔔 TIKET ${ticket.no_tiket}\n\n`
        + `<b>Perangkat:</b> ${ticket.subjek}\n`
        + `<b>Prioritas:</b> ${(ticket.prioritas || '').toUpperCase()}\n\n`
        + `✅ <b>SELESAI</b> oleh ${techUser.nama_lengkap}`;
      await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: newText,
        parse_mode: 'HTML'
      }, { timeout: 5000 });
    } catch (e) { console.error('Telegram edit error:', e.message); }

    // Send completion notification ONLY to:
    // 1. Main technician (who completed) - already knows
    // 2. Additional technicians (pendukung)
    // 3. Pelapor (via socket above)
    const additionalTechs = await TicketTechnician.findAll({
      where: { id_ticket: ticket.id, status: 'active', role: 'pendukung' },
      include: [{ model: TechnicianProfile, as: 'profile', where: { telegram_chat_id: { [Op.ne]: null, [Op.ne]: '' } } }]
    });

    const caption =
      `<b>✅ TIKET SELESAI</b>\n\n`
      + `No: <b>${ticket.no_tiket}</b>\n`
      + `Perangkat: <b>${ticket.subjek}</b>\n`
      + `Oleh: <b>${techUser.nama_lengkap}</b>\n`
      + `Solusi: ${ticket.solusi}`;

    // Notify additional technicians
    for (const at of additionalTechs) {
      if (at.profile && at.profile.telegram_chat_id) {
        try {
          if (fotoFilename) {
            await sendPhotoWithInlineKeyboard(String(at.profile.telegram_chat_id), fotoFilename, caption);
          } else {
            await sendTelegramMessage(String(at.profile.telegram_chat_id), caption);
          }
        } catch (e) {
          console.error('[TG Complete] Notify additional tech error for', at.id_user, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[TG Complete] finalizeTicketFromTelegram error:', e.message);
  }
}

async function handleWebhook(req, res) {
  try {
    const update = req.body;
    await processTelegramUpdate(update);
    res.sendStatus(200);
  } catch (err) {
    console.error('Telegram webhook error:', err.message);
    res.sendStatus(200);
  }
}

async function setupTelegramWebhook(app) {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken) return;

  try {
    const { getSettings } = require('../server');
    const settings = await getSettings();
    const baseUrl = settings.telegram_webhook_url || process.env.TELEGRAM_WEBHOOK_URL;

    if (baseUrl) {
      const webhookUrl = baseUrl + '/webhook/telegram';
      await axios.get(`https://api.telegram.org/bot${config.botToken}/setWebhook?url=${webhookUrl}`);
      console.log('Telegram webhook set to:', webhookUrl);
    } else {
      console.log('Telegram webhook URL not configured. Using polling fallback.');
      startTelegramPolling();
    }
  } catch (err) {
    console.error('Telegram webhook setup error:', err.message);
    startTelegramPolling();
  }
}

let pollInterval = null;

// Track processed callback query IDs to prevent duplicates
const processedCallbackQueries = new Set();
const MAX_PROCESSED_CALLBACKS = 1000;

// Track processed message IDs to prevent duplicate notifications
const processedMessageIds = new Set();
const MAX_PROCESSED_MESSAGES = 1000;

function markMessageProcessed(messageId) {
  if (processedMessageIds.has(messageId)) return false;
  processedMessageIds.add(messageId);
  if (processedMessageIds.size > MAX_PROCESSED_MESSAGES) {
    const entries = Array.from(processedMessageIds);
    processedMessageIds.clear();
    entries.slice(-MAX_PROCESSED_MESSAGES / 2).forEach(id => processedMessageIds.add(id));
  }
  return true;
}

async function startTelegramPolling() {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken) return;
  if (pollInterval) return;

  console.log('[TG Polling] Initializing...');

  let offset = 0;

  // Multiple initialization attempts to clear any stale connections
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await new Promise(r => setTimeout(r, attempt * 2000));
      // Reset webhook
      await axios.get(`https://api.telegram.org/bot${config.botToken}/deleteWebhook?drop_pending_updates=true`, { timeout: 5000 });
      // Get latest update to set offset
      const initRes = await axios.get(`https://api.telegram.org/bot${config.botToken}/getUpdates`, {
        params: { offset: -1, timeout: 0, limit: 1 },
        timeout: 5000
      });
      if (initRes.data && initRes.data.result && initRes.data.result.length > 0) {
        offset = initRes.data.result[0].update_id + 1;
      }
      console.log('[TG Polling] Init attempt', attempt + 1, 'OK, offset:', offset);
    } catch (e) {
      console.error('[TG Polling] Init attempt', attempt + 1, 'error:', e.message);
    }
  }

  let polling = false;

  async function pollOnce() {
    if (polling) return;
    polling = true;
    try {
      const res = await axios.get(`https://api.telegram.org/bot${config.botToken}/getUpdates`, {
        params: { offset, timeout: 0 },
        timeout: 10000
      });

      if (res.data && res.data.result) {
        const updates = res.data.result;
        if (updates && updates.length) {
          for (const update of updates) {
            await processTelegramUpdate(update);
            offset = update.update_id + 1;
          }
        }
      }
      polling = false;
      setTimeout(pollOnce, 5000); // Increased to 5s to avoid rate limits
    } catch (err) {
      polling = false;
      if (err.response && err.response.status === 409) {
        console.error('[TG Polling] 409 - retrying in 10s...');
        setTimeout(pollOnce, 10000);
      } else if (err.response && err.response.status === 429) {
        // Rate limited - wait longer
        const retryAfter = err.response.data?.parameters?.retry_after || 30;
        console.error('[TG Polling] 429 Too Many Requests - retrying in', retryAfter, 'seconds');
        setTimeout(pollOnce, (retryAfter + 5) * 1000);
      } else {
        console.error('Telegram polling error:', err.message);
        setTimeout(pollOnce, 5000);
      }
    }
  }

  // Wait for any stale connections to clear, then start
  setTimeout(pollOnce, 30000);
  console.log('[TG Polling] Started (short polling every 1.5s, initial delay 30s)');
}

function stopTelegramPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ============ CALLBACK QUERY HANDLER (Inline Keyboard) ============

async function handleCallbackQuery(callbackQuery) {
  // Deduplicate: ignore already processed callback queries
  if (processedCallbackQueries.has(callbackQuery.id)) {
    console.log('[TG Callback] Duplicate callback query ignored:', callbackQuery.id);
    return;
  }
  processedCallbackQueries.add(callbackQuery.id);
  if (processedCallbackQueries.size > MAX_PROCESSED_CALLBACKS) {
    // Keep only the most recent entries
    const entries = Array.from(processedCallbackQueries);
    processedCallbackQueries.clear();
    entries.slice(-MAX_PROCESSED_CALLBACKS / 2).forEach(id => processedCallbackQueries.add(id));
  }

  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const msgId = callbackQuery.message.message_id;

  // Find teknisi by telegram_chat_id
  const profile = await TechnicianProfile.findOne({ where: { telegram_chat_id: String(chatId) } });
  if (!profile) {
    await answerCallbackQuery(callbackQuery.id, 'Anda belum terdaftar. Gunakan /register username');
    return;
  }

  const techUser = await User.findByPk(profile.id_user);
  if (!techUser || techUser.role !== 'teknisi') {
    await answerCallbackQuery(callbackQuery.id, 'Akun Anda bukan teknisi');
    return;
  }

  // ============ AMBIL TUGAS ============
  if (data.startsWith('take_ticket_')) {
    const ticketId = parseInt(data.replace('take_ticket_', ''));
    if (!ticketId) {
      await answerCallbackQuery(callbackQuery.id, 'Data tiket tidak valid');
      return;
    }

    const taskCheck = await checkMaxTasks(techUser.id);
    if (!taskCheck.allowed) {
      await answerCallbackQuery(callbackQuery.id, taskCheck.message);
      return;
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      await answerCallbackQuery(callbackQuery.id, 'Tiket tidak ditemukan');
      return;
    }
    console.log('[TG Take] Ticket', ticketId, 'status:', ticket.status, 'teknisi:', ticket.id_teknisi);
    if (ticket.status !== 'open') {
      await answerCallbackQuery(callbackQuery.id, 'Tiket sudah diambil teknisi lain');
      return;
    }

    // Optimistic lock: only assign if still open + no teknisi yet
    const [affectedRows] = await Ticket.update(
      { status: 'in_progress', id_teknisi: techUser.id },
      { where: { id: ticketId, status: 'open', id_teknisi: null } }
    );

    console.log('[TG Take] affectedRows:', affectedRows);
    if (affectedRows === 0) {
      await answerCallbackQuery(callbackQuery.id, 'Tiket sudah diambil teknisi lain');
      return;
    }

    await ticket.reload();

    await TicketHistory.create({
      id_ticket: ticket.id,
      status: 'in_progress',
      catatan: 'Diambil via Telegram oleh ' + techUser.nama_lengkap,
      id_user: techUser.id
    });

    // Notify pelapor via socket
    const { broadcastNotification } = require('./socket');
    if (ticket.id_pelapor) {
      await broadcastNotification(ticket.id_pelapor, 'Tiket ' + ticket.no_tiket + ' Diambil',
        'Ditangani oleh ' + techUser.nama_lengkap, '/tickets/' + ticket.id);
    }

    emitDisplayUpdate(ticket.id, Ticket, 'kategoriDevice');

    // Update all Telegram messages for this ticket
    await updateTicketTakenMessages(ticket, techUser.nama_lengkap, techUser.id);

    await answerCallbackQuery(callbackQuery.id, `✅ Tiket ${ticket.no_tiket} diambil. Klik "SELESAIKAN" jika sudah selesai.`);
    return;
  }

  // ============ SELESAIKAN TUGAS ============
  if (data.startsWith('complete_ticket_')) {
    const ticketId = parseInt(data.replace('complete_ticket_', ''));
    if (!ticketId) {
      await answerCallbackQuery(callbackQuery.id, 'Data tiket tidak valid');
      return;
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket || !['in_progress', 'open', 'reopened'].includes(ticket.status)) {
      await answerCallbackQuery(callbackQuery.id, 'Tiket tidak dapat diselesaikan');
      return;
    }

    // Check if user is MAIN teknisi (only main can complete)
    const isMainTeknisi = ticket.id_teknisi === techUser.id;

    if (!isMainTeknisi) {
      await answerCallbackQuery(callbackQuery.id, 'Hanya teknisi utama yang dapat menyelesaikan tiket ini');
      return;
    }

    // Store session for photo upload flow
    const session = { step: 'upload_foto_selesai', data: { ticketId: ticket.id, techUserId: techUser.id, msgId: msgId } };
    userSessions.set(chatId, session);

    await answerCallbackQuery(callbackQuery.id, 'Silakan kirim foto bukti perbaikan');

    await sendTelegramMessage(chatId,
      '<b>UPLOD FOTO BUKTI PERBAIKAN</b>\n\n'
      + `Tiket: <b>${ticket.no_tiket}</b>\n`
      + `Perangkat: <b>${ticket.subjek}</b>\n\n`
      + 'Kirim foto bukti perbaikan, atau ketik <b>skip</b> untuk tanpa foto.\n'
      + 'Ketik /batal untuk membatalkan.'
    );
    return;
  }

    // ============ TAMBAH TEKNISI ============
  if (data.startsWith('add_tech_')) {
    const ticketId = parseInt(data.replace('add_tech_', ''));
    if (!ticketId) {
      await answerCallbackQuery(callbackQuery.id, 'Data tiket tidak valid');
      return;
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      await answerCallbackQuery(callbackQuery.id, 'Tiket tidak ditemukan');
      return;
    }

    if (ticket.id_teknisi !== techUser.id) {
      await answerCallbackQuery(callbackQuery.id, 'Hanya teknisi utama yang bisa menambah teknisi lain');
      return;
    }

    // Get already added technician IDs (including main teknisi)
    const existingTechs = await TicketTechnician.findAll({
      where: { id_ticket: ticketId, status: 'active' },
      attributes: ['id_user']
    });
    const excludeIds = [ticket.id_teknisi, ...existingTechs.map(t => t.id_user)];

    // Find available teknisi (not yet assigned, is_available=true, and has capacity)
    const teknisiList = await User.findAll({
      where: {
        role: 'teknisi',
        id: { [Op.notIn]: excludeIds }
      },
      include: [{
        model: TechnicianProfile,
        as: 'techProfile',
        where: { is_available: true },
        required: true
      }],
      order: [['nama_lengkap', 'ASC']]
    });

    // Filter by capacity (active tickets < max_tugas_aktif)
    const availableTechs = [];
    for (const tech of teknisiList) {
      const activeCount = await TicketTechnician.count({
        where: { id_user: tech.id, status: 'active' }
      });
      if (activeCount < (tech.techProfile?.max_tugas_aktif || 5)) {
        availableTechs.push(tech);
      }
    }

    if (availableTechs.length === 0) {
      await answerCallbackQuery(callbackQuery.id, 'Semua teknisi sudah ditambahkan');
      await sendTelegramMessage(chatId,
        'Semua teknisi sudah ditambahkan ke tiket ' + ticket.no_tiket
      );
      return;
    }

    // Build inline keyboard with technician list
    const techButtons = availableTechs.map(t => ([{
      text: t.nama_lengkap,
      callback_data: 'select_tech_' + ticketId + '_' + t.id
    }]));

    // Add cancel/selesai button
    techButtons.push([{ text: '❌ Selesai', callback_data: 'done_add_tech_' + ticketId }]);

    await answerCallbackQuery(callbackQuery.id, 'Pilih teknisi yang ingin ditambahkan');

    await sendInlineKeyboard(chatId,
      '<b>👥 TAMBAH TEKNISI</b>\n\n'
      + 'Tiket: <b>' + ticket.no_tiket + '</b>\n'
      + 'Pilih teknisi tambahan untuk tiket ini:',
      techButtons
    );
    return;
  }

  // ============ SELECT TECHNICIAN ============
  if (data.startsWith('select_tech_')) {
    const parts = data.split('_');
    // data format: select_tech_TICKETID_USERID
    const ticketId = parseInt(parts[2]);
    const selectedUserId = parseInt(parts[3]);

    if (!ticketId || !selectedUserId) {
      await answerCallbackQuery(callbackQuery.id, 'Data tidak valid');
      return;
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      await answerCallbackQuery(callbackQuery.id, 'Tiket tidak ditemukan');
      return;
    }

    // Check if already added
    const existing = await TicketTechnician.findOne({
      where: { id_ticket: ticketId, id_user: selectedUserId, status: 'active' }
    });
    if (existing) {
      await answerCallbackQuery(callbackQuery.id, 'Teknisi sudah ditambahkan');
      return;
    }

    // Add technician
    await TicketTechnician.create({
      id_ticket: ticketId,
      id_user: selectedUserId,
      role: 'pendukung',
      added_by: techUser.id,
      status: 'active'
    });

    // Get technician name
    const selectedTech = await User.findByPk(selectedUserId);
    const techName = selectedTech ? selectedTech.nama_lengkap : 'Teknisi';

    // Add history record
    await TicketHistory.create({
      id_ticket: ticketId,
      status: ticket.status,
      catatan: 'Ditambahkan sebagai teknisi pendukung oleh ' + techUser.nama_lengkap,
      id_user: selectedUserId
    });

    // Emit real-time update for display monitor and ticket list
    try {
      console.log('[TG Add Tech] Calling emitDisplayUpdate for ticket:', ticketId);
      await emitDisplayUpdate(ticketId, Ticket, 'kategoriDevice');
      console.log('[TG Add Tech] emitDisplayUpdate completed');
    } catch (e) {
      console.error('[TG Add Tech] Emit display update error:', e.message);
    }

    // Answer callback
    await answerCallbackQuery(callbackQuery.id, techName + ' ditambahkan ke tiket');

    // Send notification to added technician
    try {
      const addedProfile = await TechnicianProfile.findOne({ where: { id_user: selectedUserId } });
      if (addedProfile && addedProfile.telegram_chat_id) {
        const unit = ticket.unit || await ticket.getUnit();
        const unitNama = unit ? unit.nama_unit : '-';
        const notifMsg = '<b>🔔 TUGAS TAMBAHAN</b>\n\n'
          + 'Anda ditambahkan sebagai teknisi pendukung untuk:\n'
          + '<b>' + ticket.no_tiket + '</b> - ' + ticket.subjek + '\n'
          + 'Unit: ' + unitNama + '\n'
          + 'Prioritas: ' + (ticket.prioritas || '').toUpperCase() + '\n\n'
          + 'Ditambahkan oleh: ' + techUser.nama_lengkap;

        const notifButtons = [[
          { text: '🏁 SELESAIKAN', callback_data: 'complete_ticket_' + ticketId }
        ]];

        await sendInlineKeyboard(String(addedProfile.telegram_chat_id), notifMsg, notifButtons);
      }
    } catch (e) {
      console.error('[TG Add Tech] Notify error:', e.message);
    }

    // Create web notification
    try {
      const { broadcastNotification } = require('./socket');
      await broadcastNotification(selectedUserId, 'Tugas Tambahan ' + ticket.no_tiket,
        'Anda ditambahkan sebagai teknisi pendukung oleh ' + techUser.nama_lengkap,
        '/tickets/' + ticketId);
    } catch (e) {
      console.error('[TG Add Tech] Web notify error:', e.message);
    }

    // Ask if want to add more
    const confirmButtons = [[
      { text: '✅ Ya, tambah lagi', callback_data: 'add_tech_' + ticketId },
      { text: '❌ Tidak', callback_data: 'done_add_tech_' + ticketId }
    ]];

    await sendInlineKeyboard(chatId,
      '✅ <b>' + techName + '</b> berhasil ditambahkan sebagai teknisi pendukung.\n\nTambah teknisi lain?',
      confirmButtons
    );
    return;
  }

  // ============ DONE ADD TECHNICIAN ============
  if (data.startsWith('done_add_tech_')) {
    await editMessageTextSafe(chatId, msgId, '✅ Selesai menambah teknisi.');
    await answerCallbackQuery(callbackQuery.id, 'Selesai');
    return;
  }

  await answerCallbackQuery(callbackQuery.id, 'Aksi tidak dikenal');
}

// ============ SEND TICKET NOTIFICATION TO ALL TECHNICIANS ============

async function notifyTeknisiTelegram(ticket, kategoriNama, unitNama) {
  try {
    const profiles = await TechnicianProfile.findAll({
      where: { telegram_chat_id: { [Op.ne]: null, [Op.ne]: '' } }
    });
    console.log('[TG Ticket] Found', profiles.length, 'technician profiles for ticket notification');
    profiles.forEach(p => console.log('[TG Ticket]   -> id_user:', p.id_user, 'chat_id:', p.telegram_chat_id));
    if (profiles.length === 0) return;

    const msg = `<b>🔔 TIKET BARU ${ticket.no_tiket}</b>\n\n`
      + `<b>Perangkat:</b> ${ticket.subjek}\n`
      + `<b>Unit:</b> ${unitNama}\n`
      + `<b>Kategori:</b> ${kategoriNama}\n`
      + `<b>Prioritas:</b> ${ticket.prioritas.toUpperCase()}\n`
      + `<b>Deskripsi:</b> ${ticket.deskripsi || '-'}\n\n`
      + `Klik tombol di bawah untuk mengambil tugas:`;

    const buttons = [[
      { text: '✅ AMBIL TUGAS', callback_data: `take_ticket_${ticket.id}` }
    ]];

    for (const profile of profiles) {
      try {
        console.log('[TG Ticket] Sending to id_user:', profile.id_user, 'chat_id:', profile.telegram_chat_id);
        let msgId;
        if (ticket.foto) {
          msgId = await sendPhotoWithInlineKeyboard(String(profile.telegram_chat_id), ticket.foto, msg, buttons);
        } else {
          msgId = await sendInlineKeyboard(profile.telegram_chat_id, msg, buttons);
        }
        if (msgId) {
          console.log('[TG Ticket] Sent OK to id_user:', profile.id_user, 'message_id:', msgId);
          try {
            const { TelegramMessage } = require('../models');
            await TelegramMessage.create({ ref_type: 'ticket', ref_id: ticket.id, chat_id: String(profile.telegram_chat_id), message_id: msgId });
          } catch (e) { console.error('[TG Ticket] Store message_id error:', e.message); }
        } else {
          console.log('[TG Ticket] Sent to id_user:', profile.id_user, '(no message_id returned)');
        }
      } catch (e) {
        console.error(`[TG Ticket] FAILED for id_user ${profile.id_user} chat_id ${profile.telegram_chat_id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[TG Ticket] notifyTeknisiTelegram error:', e.message);
  }
}

async function updateTicketTakenMessages(ticket, teknisiNama, ambilUserId) {
  try {
    const { TelegramMessage, TechnicianProfile } = require('../models');
    const { botToken } = getTelegramConfig();
    if (!botToken) return;

    const messages = await TelegramMessage.findAll({
      where: { ref_type: 'ticket', ref_id: ticket.id }
    });

    if (messages.length === 0) return;

    const takerProfile = await TechnicianProfile.findOne({ where: { id_user: ambilUserId } });
    const takerChatId = takerProfile ? String(takerProfile.telegram_chat_id) : null;

    console.log('[TG Ticket Update] Found', messages.length, 'messages to update for', ticket.no_tiket, '| taker chat_id:', takerChatId);

    for (const m of messages) {
      try {
        const isTaker = takerChatId && m.chat_id === takerChatId;

        const newText = isTaker
          ? `🔔 TIKET ${ticket.no_tiket}\n\n`
            + `<b>Perangkat:</b> ${ticket.subjek}\n`
            + `<b>Prioritas:</b> ${(ticket.prioritas || '').toUpperCase()}\n\n`
            + `✅ <b>DIAMBIL</b> oleh ${teknisiNama}`
          : `🔔 TIKET ${ticket.no_tiket}\n\n`
            + `<b>Perangkat:</b> ${ticket.subjek}\n`
            + `<b>Prioritas:</b> ${(ticket.prioritas || '').toUpperCase()}\n\n`
            + `ℹ️ <b>Telah diambil</b> oleh ${teknisiNama}\n`
            + `Tugas ini sedang dikerjakan.`;

        const replyMarkup = isTaker
          ? { inline_keyboard: [
            [{ text: '🏁 SELESAIKAN', callback_data: `complete_ticket_${ticket.id}` }],
            [{ text: '👥 TAMBAH TEKNISI', callback_data: `add_tech_${ticket.id}` }]
          ]}
          : undefined;

        await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          chat_id: m.chat_id,
          message_id: m.message_id,
          text: newText,
          parse_mode: 'HTML',
          reply_markup: replyMarkup
        }, { timeout: 5000 });

        console.log('[TG Ticket Update] Updated message_id:', m.message_id, 'chat_id:', m.chat_id, isTaker ? '(taker)' : '(other tech)');
      } catch (e) {
        const detail = e.response && e.response.data ? e.response.data.description : e.message;
        console.error('[TG Ticket Update] Failed message_id:', m.message_id, '|', detail);
      }
    }
  } catch (e) {
    console.error('[TG Ticket Update] error:', e.message);
  }
}

async function editMessageTextSafe(chatId, msgId, text) {
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken || !msgId) return;
    await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      chat_id: chatId,
      message_id: msgId,
      text: text,
      parse_mode: 'HTML'
    }, { timeout: 5000 });
  } catch (e) {
    console.error('[TG EditMsg] error:', e.message);
  }
}

module.exports = { handleWebhook, setupTelegramWebhook, startTelegramPolling, stopTelegramPolling, sendTelegramMessage, notifyTeknisiTelegram, updateTicketTakenMessages };

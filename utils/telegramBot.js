const axios = require('axios');
const { Op } = require('sequelize');
const { User, Unit, DeviceCategory, Report, Ticket, TicketHistory, ReportTracking, Notification, TechnicianProfile, Setting, Asset, Layanan } = require('../models');
const { autoAssignReport, autoAssignTicket } = require('./autoAssign');
const { emitToAll } = require('./socket');

const userSessions = new Map();

function getTelegramConfig() {
  return {
    enabled: process.env.TELEGRAM_BOT_INBOUND === 'true',
    botToken: process.env.TELEGRAM_BOT_TOKEN || ''
  };
}

async function sendTelegramMessage(chatId, text, options = {}) {
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken) return;

    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      ...options
    }, { timeout: 10000 });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

async function sendTelegramPhoto(chatId, photo, caption) {
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken) return;

    await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      chat_id: chatId,
      photo: photo,
      caption: caption,
      parse_mode: 'HTML'
    }, { timeout: 15000 });
  } catch (err) {
    console.error('Telegram photo error:', err.message);
  }
}

async function sendInlineKeyboard(chatId, text, buttons) {
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken) return;
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    }, { timeout: 10000 });
  } catch (err) {
    console.error('Telegram inline keyboard error:', err.message);
  }
}

async function answerCallbackQuery(callbackQueryId, text) {
  try {
    const { botToken } = getTelegramConfig();
    if (!botToken) return;
    await axios.post(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: false
    }, { timeout: 5000 });
  } catch (err) {
    console.error('Telegram answerCallbackQuery error:', err.message);
  }
}

async function processTelegramUpdate(update) {
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }
  if (!update.message) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const text = msg.text || '';
  const photo = msg.photo ? msg.photo[msg.photo.length - 1] : null;

  const user = await User.findOne({
    where: { username: 'tg_' + telegramId },
    include: [{ model: TechnicianProfile, as: 'techProfile' }]
  });

  if (!user) {
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

        const assignedTech = await autoAssignReport(report);
        let assignMsg = '';
        if (assignedTech) {
          report.id_teknisi = assignedTech.id;
          await report.save();
          assignMsg = `\nTeknisi ditugaskan: <b>${assignedTech.nama_lengkap}</b>`;

          await Notification.create({
            id_user: assignedTech.id,
            title: 'Laporan Baru #' + report.id,
            message: `${user.nama_lengkap} dari ${data.nama_unit} melaporkan: ${data.nama_perangkat}`,
            link: '/reports/' + report.id
          });
        }

        const teknisiList = await User.findAll({ where: { role: 'teknisi' } });
        for (const t of teknisiList) {
          if (!assignedTech || t.id !== assignedTech.id) {
            await Notification.create({
              id_user: t.id,
              title: 'Laporan Baru #' + report.id,
              message: `${user.nama_lengkap} dari ${data.nama_unit} melaporkan: ${data.nama_perangkat}`,
              link: '/reports/' + report.id
            });
          }
        }

        await sendTelegramMessage(chatId,
          `<b>LAPORAN BERHASIL DIBUAT</b> ✅\n\n`
          + `ID Laporan: <b>#${report.id}</b>\n`
          + `Unit: ${data.nama_unit}\n`
          + `Kategori: ${data.nama_kategori}\n`
          + `Perangkat: ${data.nama_perangkat}\n`
          + `Prioritas: ${prio.toUpperCase()}\n`
          + `Status: Dilaporkan`
          + assignMsg + '\n\n'
          + 'Cek status dengan /status'
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
        const { Ticket: TicketModel } = require('../models');
        async function genTktNum() {
          for (let i = 0; i < 5; i++) {
            const c = await TicketModel.count();
            const n = 'TKT-' + String(c + 1 + i).padStart(4, '0');
            const ex = await TicketModel.findOne({ where: { no_tiket: n }, attributes: ['id'] });
            if (!ex) return n;
          }
          return 'TKT-' + Date.now().toString().slice(-8);
        }
        const no_tiket = await genTktNum();

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

        const assignedTech = await autoAssignTicket(ticket);
        let assignMsg = '';
        if (assignedTech) {
          ticket.id_teknisi = assignedTech.id;
          await ticket.save();
          assignMsg = `\nTeknisi ditugaskan: <b>${assignedTech.nama_lengkap}</b>`;

          await Notification.create({
            id_user: assignedTech.id,
            title: 'Tiket Baru ' + no_tiket,
            message: user.nama_lengkap + ': ' + ticket.subjek,
            link: '/tickets/' + ticket.id
          });
        }

        const teknisiList = await User.findAll({ where: { role: 'teknisi' } });
        const admins = await User.findAll({ where: { role: 'admin' } });
        const allNotify = [...teknisiList, ...admins];
        for (const u of allNotify) {
          if (!assignedTech || u.id !== assignedTech.id) {
            await Notification.create({
              id_user: u.id,
              title: 'Tiket Baru ' + no_tiket,
              message: user.nama_lengkap + ': ' + ticket.subjek,
              link: '/tickets/' + ticket.id
            });
          }
        }

        await sendTelegramMessage(chatId,
          `<b>TIKET BERHASIL DIBUAT</b> ✅\n\n`
          + `No. Tiket: <b>${no_tiket}</b>\n`
          + `Subjek: ${data.subjek}\n`
          + `Kategori: ${data.kategori}\n`
          + `Prioritas: ${prioritas.toUpperCase()}\n`
          + `Status: Open`
          + assignMsg + '\n\n'
          + 'Cek status dengan /status'
        );
      } catch (err) {
        console.error('Telegram ticket creation error:', err.message);
        await sendTelegramMessage(chatId, 'Terjadi kesalahan saat membuat tiket. Silakan coba lagi.');
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

    default:
      userSessions.delete(chatId);
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

async function startTelegramPolling() {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken) return;
  if (pollInterval) return;

  let offset = 0;
  pollInterval = setInterval(async () => {
    try {
      const res = await axios.get(`https://api.telegram.org/bot${config.botToken}/getUpdates`, {
        params: { offset, timeout: 5 },
        timeout: 15000
      });

      const updates = res.data.result;
      if (updates && updates.length) {
        for (const update of updates) {
          await processTelegramUpdate(update);
          offset = update.update_id + 1;
        }
      }
    } catch (err) {
      console.error('Telegram polling error:', err.message);
    }
  }, 3000);

  console.log('Telegram polling started');
}

function stopTelegramPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ============ CALLBACK QUERY HANDLER (Inline Keyboard) ============

async function handleCallbackQuery(callbackQuery) {
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

    // Check max active tasks
    if (profile && profile.max_tugas_aktif) {
      const activeTickets = await Ticket.count({
        where: { id_teknisi: techUser.id, status: { [Op.in]: ['open', 'in_progress', 'reopened'] } }
      });
      const activeReports = await Report.count({
        where: { id_teknisi: techUser.id, status: { [Op.in]: ['divalidasi', 'investigasi', 'dalam_perbaikan'] } }
      });
      if ((activeTickets + activeReports) >= profile.max_tugas_aktif) {
        await answerCallbackQuery(callbackQuery.id,
          `Batas tugas aktif tercapai (${activeTickets + activeReports}/${profile.max_tugas_aktif})`);
        return;
      }
    }

    if (!profile.is_available) {
      await answerCallbackQuery(callbackQuery.id, 'Status Anda sedang tidak tersedia');
      return;
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket || ticket.status !== 'open') {
      await answerCallbackQuery(callbackQuery.id, 'Tiket sudah diambil teknisi lain');
      return;
    }

    // Take the ticket
    ticket.status = 'in_progress';
    ticket.id_teknisi = techUser.id;
    await ticket.save();

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

    // Broadcast to display monitor
    try {
      const kategori = await DeviceCategory.findByPk(ticket.id_kategori);
      if (kategori) {
        const layanan = await Layanan.findByPk(kategori.id_layanan);
        if (layanan) {
          emitToAll('report_update_layanan', {
            kode_layanan: layanan.kode,
            report: { id: ticket.id, status: ticket.status, teknisi: techUser.nama_lengkap }
          });
        }
      }
    } catch (e) { console.error('Display emit error:', e.message); }

    // Update the Telegram message - add taken info + Selesai button
    try {
      const { botToken } = getTelegramConfig();
      await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: callbackQuery.message.text + `\n\n✅ <b>DIAMBIL</b> oleh ${techUser.nama_lengkap}`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '🏁 SELESAIKAN', callback_data: `complete_ticket_${ticket.id}` }
          ]]
        }
      }, { timeout: 5000 });
    } catch (e) { console.error('Telegram edit error:', e.message); }

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

    if (ticket.id_teknisi !== techUser.id) {
      await answerCallbackQuery(callbackQuery.id, 'Anda bukan petugas yang menangani tiket ini');
      return;
    }

    // Mark as resolved
    ticket.status = 'resolved';
    ticket.tgl_selesai = new Date();
    ticket.solusi = 'Diselesaikan via Telegram';
    await ticket.save();

    await TicketHistory.create({
      id_ticket: ticket.id,
      status: 'resolved',
      catatan: 'Diselesaikan via Telegram oleh ' + techUser.nama_lengkap,
      id_user: techUser.id
    });

    // Notify pelapor
    const { broadcastNotification } = require('./socket');
    if (ticket.id_pelapor) {
      await broadcastNotification(ticket.id_pelapor, 'Tiket ' + ticket.no_tiket + ' Selesai',
        'Diselesaikan oleh ' + techUser.nama_lengkap, '/tickets/' + ticket.id);
    }

    // Broadcast to display monitor
    try {
      const kategori = await DeviceCategory.findByPk(ticket.id_kategori);
      if (kategori) {
        const layanan = await Layanan.findByPk(kategori.id_layanan);
        if (layanan) {
          emitToAll('report_update_layanan', {
            kode_layanan: layanan.kode,
            report: { id: ticket.id, status: ticket.status, teknisi: techUser.nama_lengkap }
          });
        }
      }
    } catch (e) { console.error('Display emit error:', e.message); }

    // Update the Telegram message
    try {
      const { botToken } = getTelegramConfig();
      await axios.post(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        chat_id: chatId,
        message_id: msgId,
        text: callbackQuery.message.text + `\n\n✅ <b>SELESAI</b> oleh ${techUser.nama_lengkap} 🎉`,
        parse_mode: 'HTML'
      }, { timeout: 5000 });
    } catch (e) { console.error('Telegram edit error:', e.message); }

    await answerCallbackQuery(callbackQuery.id, `✅ Tiket ${ticket.no_tiket} selesai!`);
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
        await sendInlineKeyboard(profile.telegram_chat_id, msg, buttons);
      } catch (e) {
        console.error(`Telegram notify error for teknisi ${profile.id_user}:`, e.message);
      }
    }
  } catch (e) {
    console.error('notifyTeknisiTelegram error:', e.message);
  }
}

module.exports = { handleWebhook, setupTelegramWebhook, startTelegramPolling, stopTelegramPolling, sendTelegramMessage, notifyTeknisiTelegram };

const { Op } = require('sequelize');
const { User, Unit, DeviceCategory, Report, Ticket, TicketHistory, ReportTracking, Notification, TechnicianProfile, Setting, Asset } = require('../models');
const { autoAssignReport, autoAssignTicket } = require('./autoAssign');
const { sendWhatsAppMessage, getWhatsAppConfig } = require('./whatsapp');

const userSessions = new Map();

function generateTicketNumberSync(counter) {
  return 'TKT-' + String(counter).padStart(4, '0');
}

async function genTktNum() {
  const { Ticket: TicketModel } = require('../models');
  for (let i = 0; i < 5; i++) {
    const c = await TicketModel.count();
    const n = 'TKT-' + String(c + 1 + i).padStart(4, '0');
    const ex = await TicketModel.findOne({ where: { no_tiket: n }, attributes: ['id'] });
    if (!ex) return n;
  }
  return 'TKT-' + Date.now().toString().slice(-8);
}

async function processWhatsAppMessage(from, text) {
  try {
    const config = getWhatsAppConfig();
    if (!config.enabled) return;

    const user = await User.findOne({
      where: { username: 'wa_' + from },
      include: [{ model: TechnicianProfile, as: 'techProfile' }]
    });

    if (!user) {
      await sendWhatsAppMessage(from,
        'Anda belum terdaftar di sistem SIMRS Maintenance.\n'
        + 'Silakan hubungi admin untuk pendaftaran.\n\n'
        + 'Nomor Anda: ' + from
      );
      return;
    }

    const session = userSessions.get(from) || { step: null, data: {} };
    const msg = (text || '').trim().toLowerCase();

    if (msg === '/start' || msg === '/batal' || msg === 'batal') {
      userSessions.delete(from);
      await sendWhatsAppMessage(from,
        'Selamat datang di *SIMRS CareTrack Bot*!\n\n'
        + 'Perintah tersedia:\n'
        + '• *LAPOR* - Lapor kerusakan perangkat\n'
        + '• *TIKET* - Buat tiket IT support\n'
        + '• *STATUS* - Cek status laporan/tiket\n'
        + '• *ASET* - Info aset (scan QR)\n'
        + '• *BATAL* - Batalkan proses saat ini\n\n'
        + 'Ketik pesan biasa untuk interaksi.'
      );
      return;
    }

    if (msg === 'lapor' || msg === '/lapor') {
      session.step = 'pilih_unit';
      session.data = { type: 'report' };
      userSessions.set(from, session);

      const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
      let unitList = units.map((u, i) => `${i + 1}. ${u.nama_unit}`).join('\n');
      await sendWhatsAppMessage(from,
        '*LAPOR KERUSAKAN PERANGKAT*\n\n'
        + 'Pilih nomor unit lokasi kerusakan:\n\n'
        + unitList + '\n\n'
        + 'Ketik nomor unit atau *BATAL* untuk membatalkan.'
      );
      return;
    }

    if (msg === 'tiket' || msg === '/tiket') {
      session.step = 'tiket_subjek';
      session.data = { type: 'ticket' };
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        '*BUAT TIKET IT SUPPORT*\n\n'
        + 'Masukkan subjek masalah:\n'
        + '(Ketik *BATAL* untuk membatalkan)'
      );
      return;
    }

    if (msg === 'status' || msg === '/status') {
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

      let response = '*STATUS AKTIF ANDA*\n\n';
      if (reports.length) {
        response += '*Laporan Kerusakan:*\n';
        reports.forEach(r => {
          response += `• #${r.id} | ${r.nama_perangkat} | ${r.status.replace(/_/g, ' ')}\n`;
        });
        response += '\n';
      }
      if (tickets.length) {
        response += '*Tiket IT Support:*\n';
        tickets.forEach(t => {
          response += `• ${t.no_tiket} | ${t.subjek} | ${t.status}\n`;
        });
        response += '\n';
      }
      if (!reports.length && !tickets.length) {
        response += 'Tidak ada laporan/tiket aktif.';
      }
      await sendWhatsAppMessage(from, response);
      return;
    }

    if (msg === 'aset' || msg === '/aset') {
      session.step = 'aset_kode';
      session.data = {};
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        '*INFO ASET*\n\n'
        + 'Ketik kode aset (contoh: AST-0001).\n'
        + '(Ketik *BATAL* untuk membatalkan)'
      );
      return;
    }

    if (session.step) {
      await handleSessionStep(from, session, text, user);
      return;
    }

    await sendWhatsAppMessage(from,
      'Gunakan *LAPOR* untuk lapor kerusakan atau *TIKET* untuk tiket IT support.\n'
      + 'Ketik *START* untuk melihat semua perintah.'
    );
  } catch (err) {
    console.error('WhatsApp bot error:', err.message);
  }
}

async function handleSessionStep(from, session, text, user) {
  const { step, data } = session;
  const msg = (text || '').trim();

  switch (step) {
    case 'pilih_unit': {
      const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
      const idx = parseInt(msg) - 1;
      if (isNaN(idx) || idx < 0 || idx >= units.length) {
        await sendWhatsAppMessage(from, 'Nomor tidak valid. Ketik nomor yang benar atau *BATAL*.');
        return;
      }
      data.id_unit = units[idx].id;
      data.nama_unit = units[idx].nama_unit;
      session.step = 'pilih_kategori';
      userSessions.set(from, session);

      const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
      let catList = categories.map((c, i) => `${i + 1}. ${c.nama_kategori}`).join('\n');
      await sendWhatsAppMessage(from,
        `Unit: *${data.nama_unit}*\n\n`
        + 'Pilih kategori perangkat:\n\n'
        + catList + '\n\n'
        + 'Ketik nomor kategori.'
      );
      return;
    }

    case 'pilih_kategori': {
      const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
      const idx = parseInt(msg) - 1;
      if (isNaN(idx) || idx < 0 || idx >= categories.length) {
        await sendWhatsAppMessage(from, 'Nomor tidak valid. Ketik nomor yang benar atau *BATAL*.');
        return;
      }
      data.id_kategori = categories[idx].id;
      data.nama_kategori = categories[idx].nama_kategori;
      session.step = 'nama_perangkat';
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        `Kategori: *${data.nama_kategori}*\n\n`
        + 'Masukkan nama/spesifikasi perangkat:\n'
        + '(Contoh: "Printer Canon iP2770" atau "PC Administrasi")'
      );
      return;
    }

    case 'nama_perangkat': {
      data.nama_perangkat = msg;
      session.step = 'deskripsi';
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        `Perangkat: *${data.nama_perangkat}*\n\n`
        + 'Jelaskan kerusakan yang terjadi:\n'
        + '(Deskripsi singkat)'
      );
      return;
    }

    case 'deskripsi': {
      data.deskripsi = msg;
      session.step = 'prioritas';
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        '*Pilih tingkat prioritas:*\n\n'
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
      const prio = prioMap[msg];
      if (!prio) {
        await sendWhatsAppMessage(from, 'Pilihan tidak valid. Ketik 1-4 atau *BATAL*.');
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
          catatan: 'Laporan dibuat via WhatsApp oleh ' + user.nama_lengkap,
          id_user: user.id
        });

        const assignedTech = await autoAssignReport(report);
        let assignMsg = '';
        if (assignedTech) {
          report.id_teknisi = assignedTech.id;
          await report.save();
          assignMsg = `\nTeknisi ditugaskan: *${assignedTech.nama_lengkap}*`;

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

        await sendWhatsAppMessage(from,
          `*LAPORAN BERHASIL DIBUAT* ✅\n\n`
          + `ID Laporan: *#${report.id}*\n`
          + `Unit: ${data.nama_unit}\n`
          + `Kategori: ${data.nama_kategori}\n`
          + `Perangkat: ${data.nama_perangkat}\n`
          + `Prioritas: ${prio.toUpperCase()}\n`
          + `Status: Dilaporkan`
          + assignMsg + '\n\n'
          + 'Cek status dengan *STATUS*'
        );
      } catch (err) {
        console.error('WhatsApp report creation error:', err.message);
        await sendWhatsAppMessage(from, 'Terjadi kesalahan saat membuat laporan. Silakan coba lagi.');
      }

      userSessions.delete(from);
      return;
    }

    case 'tiket_subjek': {
      data.subjek = msg;
      session.step = 'tiket_kategori';
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        `Subjek: *${data.subjek}*\n\n`
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
      const kategori = kategoriMap[msg];
      if (!kategori) {
        await sendWhatsAppMessage(from, 'Pilihan tidak valid. Ketik 1-5 atau *BATAL*.');
        return;
      }
      data.kategori = kategori;
      session.step = 'tiket_deskripsi';
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        `Kategori: *${kategori}*\n\n`
        + 'Jelaskan masalah yang dialami:\n'
        + '(Deskripsi singkat)'
      );
      return;
    }

    case 'tiket_deskripsi': {
      data.deskripsi = msg;
      session.step = 'tiket_prioritas';
      userSessions.set(from, session);
      await sendWhatsAppMessage(from,
        '*Pilih tingkat prioritas:*\n\n'
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
      const prioritas = prioMap[msg];
      if (!prioritas) {
        await sendWhatsAppMessage(from, 'Pilihan tidak valid. Ketik 1-4 atau *BATAL*.');
        return;
      }
      data.prioritas = prioritas;

      try {
        const no_tiket = await genTktNum();

        const ticket = await Ticket.create({
          no_tiket,
          subjek: data.subjek,
          deskripsi: data.deskripsi,
          kategori: data.kategori,
          prioritas: data.prioritas,
          sumber: 'whatsapp',
          id_pelapor: user.id,
          id_unit: user.id_unit || null,
          status: 'open'
        });

        await TicketHistory.create({
          id_ticket: ticket.id,
          status: 'open',
          catatan: 'Tiket dibuat via WhatsApp oleh ' + user.nama_lengkap,
          id_user: user.id
        });

        const assignedTech = await autoAssignTicket(ticket);
        let assignMsg = '';
        if (assignedTech) {
          ticket.id_teknisi = assignedTech.id;
          await ticket.save();
          assignMsg = `\nTeknisi ditugaskan: *${assignedTech.nama_lengkap}*`;

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

        await sendWhatsAppMessage(from,
          `*TIKET BERHASIL DIBUAT* ✅\n\n`
          + `No. Tiket: *${no_tiket}*\n`
          + `Subjek: ${data.subjek}\n`
          + `Kategori: ${data.kategori}\n`
          + `Prioritas: ${prioritas.toUpperCase()}\n`
          + `Status: Open`
          + assignMsg + '\n\n'
          + 'Cek status dengan *STATUS*'
        );
      } catch (err) {
        console.error('WhatsApp ticket creation error:', err.message);
        await sendWhatsAppMessage(from, 'Terjadi kesalahan saat membuat tiket. Silakan coba lagi.');
      }

      userSessions.delete(from);
      return;
    }

    case 'aset_kode': {
      const kode = msg.toUpperCase();
      const asset = await Asset.findOne({
        where: { kode_asset: kode },
        include: [
          { model: Unit, as: 'unit' },
          { model: DeviceCategory, as: 'kategori' }
        ]
      });

      if (!asset) {
        await sendWhatsAppMessage(from, `Aset dengan kode *${kode}* tidak ditemukan.\nKetik kode lain atau *BATAL*.`);
        return;
      }

      await sendWhatsAppMessage(from,
        `*INFO ASET: ${asset.kode_asset}*\n\n`
        + `Nama: ${asset.nama_perangkat}\n`
        + `Kategori: ${asset.kategori ? asset.kategori.nama_kategori : '-'}\n`
        + `Unit: ${asset.unit ? asset.unit.nama_unit : '-'}\n`
        + `Lokasi: ${asset.lokasi_detail || '-'}\n`
        + `Merk: ${asset.merk || '-'}\n`
        + `Model: ${asset.model || '-'}\n`
        + `Serial: ${asset.serial_number || '-'}\n`
        + `Kondisi: ${asset.kondisi.replace(/_/g, ' ')}\n`
        + `Tahun: ${asset.tahun_pembelian || '-'}\n\n`
        + 'Gunakan *LAPOR* untuk melaporkan kerusakan pada aset ini.'
      );
      userSessions.delete(from);
      return;
    }

    default:
      userSessions.delete(from);
  }
}

module.exports = { processWhatsAppMessage };

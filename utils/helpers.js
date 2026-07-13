const { User, Ticket, Layanan, DeviceCategory } = require('../models');
const { broadcastNotification, emitToAll } = require('./socket');

const STATUS_MAP_TICKET = {
  'open': 'Terbuka',
  'in_progress': 'Dalam Pengerjaan',
  'resolved': 'Terselesaikan',
  'closed': 'Ditutup',
  'reopened': 'Dibuka Ulang'
};

const STATUS_MAP_REPORT = {
  'dilaporkan': 'Dilaporkan',
  'divalidasi': 'Divalidasi',
  'investigasi': 'Investigasi',
  'dalam_perbaikan': 'Dalam Perbaikan',
  'selesai': 'Selesai',
  'tidak_valid': 'Tidak Valid',
  'tidak_dapat_diperbaiki': 'Tidak Dapat Diperbaiki'
};

function formatStatusTicket(status) {
  return STATUS_MAP_TICKET[status] || status;
}

function formatStatusReport(status) {
  return STATUS_MAP_REPORT[status] || status;
}

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function generateTicketNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await Ticket.count();
    const no_tiket = 'TKT-' + String(count + 1 + attempt).padStart(4, '0');
    const exists = await Ticket.findOne({ where: { no_tiket }, attributes: ['id'] });
    if (!exists) return no_tiket;
  }
  return 'TKT-' + Date.now().toString().slice(-8);
}

async function notifyRole(role, title, message, link, excludeUserId) {
  const users = await User.findAll({ where: { role } });
  for (const u of users) {
    if (excludeUserId && u.id === excludeUserId) continue;
    await broadcastNotification(u.id, title, message, link);
  }
}

async function notifyAllAdmins(title, message, link, excludeUserId) {
  return notifyRole('admin', title, message, link, excludeUserId);
}

async function notifyAllTeknisi(title, message, link, excludeUserId) {
  return notifyRole('teknisi', title, message, link, excludeUserId);
}

async function emitDisplayUpdate(entityId, model, kategoriAlias) {
  try {
    console.log('[emitDisplayUpdate] Called for entityId:', entityId, 'model:', model.name);
    const entity = await model.findByPk(entityId);
    if (!entity) {
      console.log('[emitDisplayUpdate] Entity not found:', entityId, model.name);
      return;
    }

    const isTicket = model.name === 'Ticket';
    const eventName = 'report_update_layanan';
    const reportData = { id: entity.id, type: isTicket ? 'ticket' : 'report', status: entity.status };

    emitToAll(eventName, { report: reportData });
    console.log('[emitDisplayUpdate] Emitted base event:', eventName);

    const kategori = entity.kategori || entity.kategoriDevice;
    if (!kategori) {
      const dc = await DeviceCategory.findByPk(entity.id_kategori);
      if (dc) {
        const layanan = await Layanan.findByPk(dc.id_layanan);
        if (layanan) {
          console.log('[emitDisplayUpdate] Emitting with kode_layanan:', layanan.kode);
          emitToAll('report_update_layanan', {
            kode_layanan: layanan.kode,
            report: reportData
          });
        }
      }
      return;
    }
    if (kategori) {
      const layanan = await Layanan.findByPk(kategori.id_layanan);
      if (layanan) {
        console.log('[emitDisplayUpdate] Emitting with kode_layanan:', layanan.kode);
        emitToAll('report_update_layanan', {
          kode_layanan: layanan.kode,
          report: reportData
        });
      }
    }
  } catch (e) { console.error('Display emit error:', e.message); }
}

function durMs(a, b) {
  if (!a || !b) return null;
  return new Date(a) - new Date(b);
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '-';
  const detik = Math.round(ms / 1000);
  if (detik < 0) return '-';
  const menit = Math.floor(detik / 60);
  const jam = Math.floor(menit / 60);
  const s = detik % 60;
  const m = menit % 60;
  const h = jam;
  let r = '';
  if (h > 0) r += h + ' jam ';
  if (m > 0) r += m + ' menit ';
  r += s + ' detik';
  return r.trim();
}

function formatDateIndonesian(date) {
  if (!date) return '-';
  const d = new Date(date);
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dayName = days[d.getDay()];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return dayName + ' ' + day + ' ' + month + ' ' + year + ', ' + hours + ':' + minutes + ':' + seconds;
}

module.exports = {
  formatStatusTicket,
  formatStatusReport,
  formatDate,
  generateTicketNumber,
  notifyRole,
  notifyAllAdmins,
  notifyAllTeknisi,
  emitDisplayUpdate,
  durMs,
  formatDuration,
  formatDateIndonesian
};

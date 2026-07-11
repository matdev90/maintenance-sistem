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
    const entity = await model.findByPk(entityId, {
      include: [{ model: DeviceCategory, as: kategoriAlias }]
    });
    const kategori = entity && (entity.kategori || entity.kategoriDevice);
    if (kategori) {
      const layanan = await Layanan.findByPk(kategori.id_layanan);
      if (layanan) {
        emitToAll('report_update_layanan', {
          kode_layanan: layanan.kode,
          report: { id: entity.id, status: entity.status }
        });
      }
    }
  } catch (e) { console.error('Display emit error:', e.message); }
}

module.exports = {
  formatStatusTicket,
  formatStatusReport,
  formatDate,
  generateTicketNumber,
  notifyRole,
  notifyAllAdmins,
  notifyAllTeknisi,
  emitDisplayUpdate
};

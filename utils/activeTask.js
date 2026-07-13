const { Op } = require('sequelize');
const { Report, Ticket, TechnicianProfile } = require('../models');

async function getActiveTaskCount(userId) {
  const [activeReports, activeTickets] = await Promise.all([
    Report.count({
      where: { id_teknisi: userId, status: { [Op.in]: ['divalidasi', 'investigasi', 'dalam_perbaikan'] } }
    }),
    Ticket.count({
      where: { id_teknisi: userId, status: { [Op.in]: ['open', 'in_progress', 'reopened'] } }
    })
  ]);
  return { activeReports, activeTickets, totalActive: activeReports + activeTickets };
}

async function checkMaxTasks(userId) {
  const profile = await TechnicianProfile.findOne({ where: { id_user: userId } });
  if (!profile) return { allowed: true, message: '' };

  if (!profile.is_available) {
    return { allowed: false, message: 'Anda sedang tidak tersedia. Ubah status availability terlebih dahulu.' };
  }

  const { totalActive } = await getActiveTaskCount(userId);
  if (totalActive >= profile.max_tugas_aktif) {
    return { allowed: false, message: `Batas tugas aktif tercapai (${totalActive}/${profile.max_tugas_aktif}). Selesaikan tugas lain terlebih dahulu.` };
  }

  return { allowed: true, message: '' };
}

module.exports = { getActiveTaskCount, checkMaxTasks };

const { User, TechnicianProfile, Report, Ticket, Notification, Unit } = require('../models');
const { Op } = require('sequelize');

async function autoAssignReport(report) {
  try {
    const unit = report.id_unit ? await Unit.findByPk(report.id_unit) : null;
    const unitName = unit ? unit.nama_unit : '';

    const teknisiList = await User.findAll({
      where: { role: 'teknisi' },
      include: [{ model: TechnicianProfile, as: 'techProfile' }]
    });

    if (!teknisiList.length) return null;

    const candidates = teknisiList.filter(t => {
      const profile = t.techProfile;
      if (profile && !profile.is_available) return false;
      return true;
    });

    if (!candidates.length) return teknisiList[0];

    const scored = await Promise.all(candidates.map(async (t) => {
      let score = 0;
      const profile = t.techProfile;

      if (profile && profile.spesialisasi) {
        const specs = profile.spesialisasi.toLowerCase().split(',').map(s => s.trim());
        const kategoriName = report.nama_perangkat ? report.nama_perangkat.toLowerCase() : '';
        if (specs.some(s => kategoriName.includes(s))) score += 10;
      }

      const activeReports = await Report.count({
        where: {
          id_teknisi: t.id,
          status: { [Op.in]: ['divalidasi', 'investigasi', 'dalam_perbaikan'] }
        }
      });
      const activeTickets = await Ticket.count({
        where: {
          id_teknisi: t.id,
          status: { [Op.in]: ['open', 'in_progress', 'reopened'] }
        }
      });
      const totalActive = activeReports + activeTickets;
      const maxTugas = (profile && profile.max_tugas_aktif) ? profile.max_tugas_aktif : 5;

      if (totalActive >= maxTugas) score -= 20;
      else score += (maxTugas - totalActive) * 2;

      return { user: t, score, activeCount: totalActive };
    }));

    scored.sort((a, b) => b.score - a.score || a.activeCount - b.activeCount);
    return scored[0].user;
  } catch (err) {
    console.error('Auto-assign error:', err.message);
    return null;
  }
}

async function autoAssignTicket(ticket) {
  try {
    const teknisiList = await User.findAll({
      where: { role: 'teknisi' },
      include: [{ model: TechnicianProfile, as: 'techProfile' }]
    });

    if (!teknisiList.length) return null;

    const candidates = teknisiList.filter(t => {
      const profile = t.techProfile;
      if (profile && !profile.is_available) return false;
      return true;
    });

    if (!candidates.length) return teknisiList[0];

    const scored = await Promise.all(candidates.map(async (t) => {
      let score = 0;
      const profile = t.techProfile;

      if (profile && profile.spesialisasi) {
        const specs = profile.spesialisasi.toLowerCase().split(',').map(s => s.trim());
        const kategori = ticket.kategori ? ticket.kategori.toLowerCase() : '';
        if (specs.includes(kategori)) score += 10;
      }

      const activeTickets = await Ticket.count({
        where: {
          id_teknisi: t.id,
          status: { [Op.in]: ['open', 'in_progress', 'reopened'] }
        }
      });
      const activeReports = await Report.count({
        where: {
          id_teknisi: t.id,
          status: { [Op.in]: ['divalidasi', 'investigasi', 'dalam_perbaikan'] }
        }
      });
      const totalActive = activeTickets + activeReports;
      const maxTugas = (profile && profile.max_tugas_aktif) ? profile.max_tugas_aktif : 5;

      if (totalActive >= maxTugas) score -= 20;
      else score += (maxTugas - totalActive) * 2;

      return { user: t, score, activeCount: totalActive };
    }));

    scored.sort((a, b) => b.score - a.score || a.activeCount - b.activeCount);
    return scored[0].user;
  } catch (err) {
    console.error('Auto-assign ticket error:', err.message);
    return null;
  }
}

module.exports = { autoAssignReport, autoAssignTicket };

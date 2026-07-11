const { Op, fn, col } = require('sequelize');
const { Ticket, TicketHistory, Unit, DeviceCategory, User, TechnicianProfile } = require('../models');

exports.index = async (req, res) => {
  const where = {};
  if (req.user.role === 'pelapor') where.id_unit = req.user.id_unit;
  if (req.user.role === 'teknisi') where.id_teknisi = req.user.id;

  // KPI Cards
  const ticketOpen = await Ticket.count({ where: { ...where, status: { [Op.in]: ['open', 'reopened'] } } });
  const ticketProgress = await Ticket.count({ where: { ...where, status: 'in_progress' } });
  const ticketResolved = await Ticket.count({ where: { ...where, status: { [Op.in]: ['resolved', 'closed'] } } });
  const allCount = await Ticket.count({ where });

  // Tiket terbaru
  const ticketBaru = await Ticket.findAll({
    where,
    include: [
      { model: Unit, as: 'unit' },
      { model: User, as: 'pelapor' },
      { model: User, as: 'teknisi' }
    ],
    order: [['created_at', 'DESC']],
    limit: 10
  });

  // Distribusi per Unit
  const ticketsByUnit = await Ticket.findAll({
    attributes: [[col('unit.nama_unit'), 'unit'], [fn('COUNT', col('Ticket.id')), 'total']],
    include: [{ model: Unit, as: 'unit', attributes: [] }],
    where, group: ['unit.id'], raw: true
  });

  // Distribusi per Status
  const ticketsByStatus = await Ticket.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'total']],
    where, group: ['status'], raw: true
  });

  // Tren bulanan
  const monthlyTrend = await Ticket.findAll({
    attributes: [[fn('strftime', '%m', col('created_at')), 'bulan'], [fn('COUNT', col('id')), 'total']],
    where: { ...where, created_at: { [Op.gte]: new Date(new Date().getFullYear(), 0, 1) } },
    group: [fn('strftime', '%m', col('created_at'))],
    raw: true, order: [[fn('strftime', '%m', col('created_at')), 'ASC']]
  });

  // Distribusi Prioritas
  const byPriority = await Ticket.findAll({
    attributes: ['prioritas', [fn('COUNT', col('id')), 'total']],
    where, group: ['prioritas'], raw: true
  });

  // Distribusi Kategori
  const byCategory = await Ticket.findAll({
    attributes: [[col('kategoriDevice.nama_kategori'), 'kategori'], [fn('COUNT', col('Ticket.id')), 'total']],
    include: [{ model: DeviceCategory, as: 'kategoriDevice', attributes: [] }],
    where: { ...where, id_kategori: { [Op.ne]: null } },
    group: ['kategoriDevice.id'], raw: true, limit: 5
  });

  // Top 10 Unit
  const top10Units = await Ticket.findAll({
    attributes: [[col('unit.nama_unit'), 'unit'], [fn('COUNT', col('Ticket.id')), 'total']],
    include: [{ model: Unit, as: 'unit', attributes: [] }],
    where, group: ['unit.id'],
    order: [[fn('COUNT', col('Ticket.id')), 'DESC']],
    raw: true, limit: 10
  });

  // KPI Waktu: Response Time (dibuat → diambil) & Resolution Time (dibuat → selesai)
  const completedTickets = await Ticket.findAll({
    where: { ...where, tgl_selesai: { [Op.ne]: null } },
    attributes: ['id', 'created_at', 'tgl_selesai'],
    raw: true
  });
  const completedIds = completedTickets.map(t => t.id);
  const ambilHistories = completedIds.length
    ? await TicketHistory.findAll({ where: { id_ticket: completedIds, status: 'in_progress' }, attributes: ['id_ticket', 'created_at'], raw: true })
    : [];
  const ambilMap = {};
  ambilHistories.forEach(h => { ambilMap[h.id_ticket] = h.created_at; });

  let totalResponseMs = 0, responseCount = 0, totalResMs = 0, resCount = 0;
  completedTickets.forEach(t => {
    const tglAmbil = ambilMap[t.id];
    if (tglAmbil && t.created_at) {
      totalResponseMs += new Date(tglAmbil) - new Date(t.created_at);
      responseCount++;
    }
    if (t.tgl_selesai && t.created_at) {
      totalResMs += new Date(t.tgl_selesai) - new Date(t.created_at);
      resCount++;
    }
  });
  function fmtDuration(ms) {
    if (!ms) return '0';
    const dtk = Math.round(ms / 1000);
    const mnt = Math.floor(dtk / 60);
    const jam = Math.floor(mnt / 60);
    if (jam > 0) return jam + 'j ' + (mnt % 60) + 'm';
    if (mnt > 0) return mnt + 'm ' + (dtk % 60) + 'd';
    return dtk + 'd';
  }
  const avgResponseStr = responseCount > 0 ? fmtDuration(totalResponseMs / responseCount) : '0';
  const avgResolutionStr = resCount > 0 ? fmtDuration(totalResMs / resCount) : '0';

  // Performa Teknisi
  let technicianPerf = [];
  if (req.user.role === 'admin') {
    const technicians = await User.findAll({
      where: { role: 'teknisi' },
      include: [{ model: TechnicianProfile, as: 'techProfile' }],
      order: [['nama_lengkap', 'ASC']]
    });
    for (const tech of technicians) {
      const doneTickets = await Ticket.findAll({
        where: { id_teknisi: tech.id, tgl_selesai: { [Op.ne]: null } },
        attributes: ['created_at', 'tgl_selesai'], raw: true
      });
      const active = await Ticket.count({
        where: { id_teknisi: tech.id, status: { [Op.in]: ['open', 'in_progress', 'reopened'] } }
      });
      const totalDone = doneTickets.length;
      let avgTime = 0;
      if (totalDone > 0) {
        const totalMs = doneTickets.reduce((s, r) => s + (new Date(r.tgl_selesai) - new Date(r.created_at)), 0);
        avgTime = Math.round((totalMs / totalDone) / (1000 * 60 * 60) * 10) / 10;
      }
      technicianPerf.push({
        nama: tech.nama_lengkap,
        spesialisasi: tech.techProfile ? tech.techProfile.spesialisasi : '-',
        active, completed: totalDone, avgHours: avgTime,
        available: tech.techProfile ? tech.techProfile.is_available : true
      });
    }
    technicianPerf.sort((a, b) => b.completed - a.completed);
  }

  res.render('dashboard/index', {
    title: 'Dashboard',
    ticketOpen, ticketProgress, ticketResolved, allCount, ticketBaru,
    ticketsByUnit, ticketsByStatus, monthlyTrend, byPriority, byCategory,
    avgResponseStr, avgResolutionStr, top10Units, technicianPerf
  });
};

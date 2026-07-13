const { Op } = require('sequelize');
const { Report, Ticket, SlaTarget, User, Notification, Unit } = require('../models');
const { sendTelegramNotification } = require('./telegram');

let slaCheckInterval = null;

async function checkSlaViolations() {
  try {
    const now = new Date();
    const slaTargets = await SlaTarget.findAll();
    const slaMap = {};
    slaTargets.forEach(s => { slaMap[s.prioritas] = s; });

    const pendingReports = await Report.findAll({
      where: {
        status: { [Op.in]: ['dilaporkan', 'divalidasi', 'investigasi', 'dalam_perbaikan'] }
      },
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' }
      ]
    });

    for (const report of pendingReports) {
      const sla = slaMap[report.prioritas];
      if (!sla) continue;

      let violated = false;
      let violationType = '';
      let elapsed = 0;
      let limit = 0;

      if (report.status === 'dilaporkan' && report.tgl_validasi === null) {
        elapsed = (now - new Date(report.created_at)) / (1000 * 60 * 60);
        limit = sla.batas_validasi_jam;
        violationType = 'validasi';
        if (elapsed > limit) violated = true;
      } else if (report.status === 'divalidasi' && report.tgl_investigasi === null) {
        elapsed = (now - new Date(report.tgl_validasi)) / (1000 * 60 * 60);
        limit = sla.batas_investigasi_jam;
        violationType = 'investigasi';
        if (elapsed > limit) violated = true;
      } else if (['investigasi', 'dalam_perbaikan'].includes(report.status) && report.tgl_selesai === null) {
        const startDate = report.tgl_mulai_perbaikan || report.tgl_investigasi || report.created_at;
        elapsed = (now - new Date(startDate)) / (1000 * 60 * 60);
        limit = sla.batas_selesai_jam;
        violationType = 'penyelesaian';
        if (elapsed > limit) violated = true;
      }

      if (violated) {
        const admins = await User.findAll({ where: { role: 'admin' } });
        const unitName = report.unit ? report.unit.nama_unit : '-';

        for (const admin of admins) {
          const existingNotif = await Notification.findOne({
            where: {
              id_user: admin.id,
              link: '/reports/' + report.id,
              title: { [Op.like]: '%SLA%' }
            }
          });

          if (!existingNotif) {
            await Notification.create({
              id_user: admin.id,
              title: `SLA VIOLATION - Laporan #${report.id}`,
              message: `Laporan ${unitName} melewati batas ${violationType} (${Math.round(elapsed)} jam > ${limit} jam limit)`,
              link: '/reports/' + report.id
            });
          }
        }

        try {
          const pelaporName = report.pelapor ? report.pelapor.nama_lengkap : '-';
          await sendTelegramNotification(
            `<b>⚠️ SLA VIOLATION</b>\n\n`
            + `<b>Laporan:</b> #${report.id}\n`
            + `<b>Unit:</b> ${unitName}\n`
            + `<b>Prioritas:</b> ${report.prioritas.toUpperCase()}\n`
            + `<b>Pelanggaran:</b> ${violationType}\n`
            + `<b>Waktu:</b> ${Math.round(elapsed)} jam (limit: ${limit} jam)`
          );
        } catch (e) {
          // silent
        }
      }
    }
  } catch (err) {
    console.error('SLA check error:', err.message);
  }
}

async function checkTicketSlaViolations() {
  try {
    const now = new Date();
    const slaTargets = await SlaTarget.findAll();
    const slaMap = {};
    slaTargets.forEach(s => { slaMap[s.prioritas] = s; });

    const pendingTickets = await Ticket.findAll({
      where: {
        status: { [Op.in]: ['open', 'in_progress'] }
      },
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' }
      ]
    });

    const ticketToSlaPriority = { rendah: 'ringan', sedang: 'sedang', tinggi: 'berat', kritis: 'kritis' };

    for (const ticket of pendingTickets) {
      const slaKey = ticketToSlaPriority[ticket.prioritas] || ticket.prioritas;
      const sla = slaMap[slaKey];
      if (!sla) continue;

      let violated = false;
      let violationType = '';
      let elapsed = 0;
      let limit = 0;

      if (ticket.status === 'open') {
        elapsed = (now - new Date(ticket.created_at)) / (1000 * 60 * 60);
        limit = sla.batas_validasi_jam;
        violationType = 'validasi';
        if (elapsed > limit) violated = true;
      } else if (ticket.status === 'in_progress') {
        const startDate = ticket.updated_at || ticket.created_at;
        elapsed = (now - new Date(startDate)) / (1000 * 60 * 60);
        limit = sla.batas_selesai_jam;
        violationType = 'penyelesaian';
        if (elapsed > limit) violated = true;
      }

      if (violated) {
        const admins = await User.findAll({ where: { role: 'admin' } });
        const unitName = ticket.unit ? ticket.unit.nama_unit : '-';

        for (const admin of admins) {
          const existingNotif = await Notification.findOne({
            where: {
              id_user: admin.id,
              link: '/tickets/' + ticket.id,
              title: { [Op.like]: '%SLA%' }
            }
          });

          if (!existingNotif) {
            await Notification.create({
              id_user: admin.id,
              title: `SLA VIOLATION - Tiket ${ticket.no_tiket}`,
              message: `Tiket ${ticket.no_tiket} (${unitName}) melewati batas ${violationType} (${Math.round(elapsed)} jam > ${limit} jam limit)`,
              link: '/tickets/' + ticket.id
            });
          }
        }

        try {
          await sendTelegramNotification(
            `<b>⚠️ SLA VIOLATION</b>\n\n`
            + `<b>Tiket:</b> ${ticket.no_tiket}\n`
            + `<b>Unit:</b> ${unitName}\n`
            + `<b>Prioritas:</b> ${ticket.prioritas.toUpperCase()}\n`
            + `<b>Pelanggaran:</b> ${violationType}\n`
            + `<b>Waktu:</b> ${Math.round(elapsed)} jam (limit: ${limit} jam)`
          );
        } catch (e) {
          // silent
        }
      }
    }
  } catch (err) {
    console.error('Ticket SLA check error:', err.message);
  }
}

async function runAllSlaChecks() {
  await checkSlaViolations();
  await checkTicketSlaViolations();
}

function startSlaMonitor(intervalMs = 300000) {
  if (slaCheckInterval) clearInterval(slaCheckInterval);
  runAllSlaChecks();
  slaCheckInterval = setInterval(runAllSlaChecks, intervalMs);
  console.log(`SLA monitor started (interval: ${intervalMs / 1000}s)`);
}

function stopSlaMonitor() {
  if (slaCheckInterval) {
    clearInterval(slaCheckInterval);
    slaCheckInterval = null;
  }
}

module.exports = { checkSlaViolations, checkTicketSlaViolations, startSlaMonitor, stopSlaMonitor };

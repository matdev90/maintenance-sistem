const { PreventiveMaintenance, User, Notification } = require('../models');
const { broadcastNotification } = require('./socket');
const { Op } = require('sequelize');

async function checkOverduePm() {
  const today = new Date().toISOString().split('T')[0];
  const overdue = await PreventiveMaintenance.findAll({
    where: { status: 'aktif', berikutnya: { [Op.lte]: today } }
  });

  for (const pm of overdue) {
    const admins = await User.findAll({ where: { role: 'admin' } });
    for (const admin of admins) {
      const existing = await Notification.findOne({
        where: { id_user: admin.id, title: { [Op.like]: '%Maintenance%' + pm.nama_perangkat } }
      });
      if (!existing) {
        await broadcastNotification(admin.id, 'Maintenance Reminder: ' + pm.nama_perangkat,
          `Maintenance ${pm.frekuensi} sudah jatuh tempo (${pm.berikutnya})`, '/admin/pm/' + pm.id);
      }
    }
  }
}

let interval = null;
function startPmScheduler(intervalMs = 86400000) {
  if (interval) clearInterval(interval);
  checkOverduePm();
  interval = setInterval(checkOverduePm, intervalMs);
  console.log('PM scheduler started');
}

module.exports = { checkOverduePm, startPmScheduler };

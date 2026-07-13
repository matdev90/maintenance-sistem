const { Op } = require('sequelize');
const { AuditLog } = require('../models');

exports.index = async (req, res) => {
  const { action, entity_type, username, dari, sampai, q, page } = req.query;
  const limit = 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (action) where.action = action;
  if (entity_type) where.entity_type = entity_type;
  if (username) where.username = { [Op.like]: '%' + username + '%' };
  if (dari && sampai) {
    where.created_at = { [Op.between]: [new Date(dari), new Date(sampai + ' 23:59:59')] };
  }
  if (q) {
    where[Op.or] = [
      { username: { [Op.like]: '%' + q + '%' } },
      { detail: { [Op.like]: '%' + q + '%' } },
      { action: { [Op.like]: '%' + q + '%' } }
    ];
  }

  const { count, rows: logs } = await AuditLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit, offset
  });

  const totalPages = Math.ceil(count / limit);
  const currentPage = parseInt(page) || 1;

  res.render('admin/logs', {
    title: 'Log Aktivitas',
    logs,
    filters: { action, entity_type, username, dari, sampai, q },
    pagination: { total: count, totalPages, currentPage, limit }
  });
};

exports.show = async (req, res) => {
  const log = await AuditLog.findByPk(req.params.id);
  if (!log) {
    req.flash('error', 'Log tidak ditemukan');
    return res.redirect('/admin/logs');
  }
  res.render('admin/log_detail', { title: 'Detail Log', log });
};

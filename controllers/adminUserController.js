const { Op } = require('sequelize');
const { User, Unit } = require('../models');
const { hashPassword } = require('../middlewares/auth');
const { logUser } = require('../utils/logger');

exports.index = async (req, res) => {
  const { page, q, role } = req.query;
  const limit = 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (q) {
    where[Op.or] = [
      { username: { [Op.like]: '%' + q + '%' } },
      { nama_lengkap: { [Op.like]: '%' + q + '%' } }
    ];
  }
  if (role) where.role = role;

  const { count, rows: users } = await User.findAndCountAll({
    where,
    include: [{ model: Unit, as: 'unit' }],
    order: [['created_at', 'DESC']],
    limit, offset
  });
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  res.render('admin/users', {
    title: 'Manajemen Pengguna', users, units,
    filters: { q, role },
    pagination: { total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page) || 1, limit }
  });
};

exports.create = async (req, res) => {
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  res.render('admin/user_form', { title: 'Tambah Pengguna', user: null, units });
};

exports.edit = async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) { req.flash('error', 'Pengguna tidak ditemukan'); return res.redirect('/admin/users'); }
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  res.render('admin/user_form', { title: 'Edit Pengguna', user, units });
};

const VALID_ROLES = ['admin', 'teknisi', 'pelapor'];

exports.store = async (req, res) => {
  const { username, password, nama_lengkap, role, id_unit } = req.body;

  if (!username || !password || !nama_lengkap || !role) {
    req.flash('error', 'Semua field wajib diisi');
    return res.redirect('/admin/users/create');
  }
  if (!VALID_ROLES.includes(role)) {
    req.flash('error', 'Role tidak valid');
    return res.redirect('/admin/users/create');
  }

  const exist = await User.findOne({ where: { username } });
  if (exist) {
    req.flash('error', 'Username sudah digunakan');
    return res.redirect('/admin/users/create');
  }
  const newUser = await User.create({
    username, password_hash: hashPassword(password), nama_lengkap, role, id_unit: id_unit || null
  });
  logUser(req.user, 'create', newUser.id, { username, nama_lengkap, role, id_unit }, req);
  req.flash('success', 'Pengguna berhasil ditambahkan');
  res.redirect('/admin/users');
};

exports.update = async (req, res) => {
  const { password, nama_lengkap, role, id_unit } = req.body;

  if (!nama_lengkap || !role) {
    req.flash('error', 'Nama lengkap dan role wajib diisi');
    return res.redirect('/admin/users');
  }
  if (!VALID_ROLES.includes(role)) {
    req.flash('error', 'Role tidak valid');
    return res.redirect('/admin/users');
  }

  const user = await User.findByPk(req.params.id);
  if (!user) { req.flash('error', 'Pengguna tidak ditemukan'); return res.redirect('/admin/users'); }

  const data = { nama_lengkap, role, id_unit: id_unit || null };
  if (password) data.password_hash = hashPassword(password);

  await user.update(data);
  logUser(req.user, 'update', user.id, { username: user.username, nama_lengkap, role, id_unit, password_changed: !!password }, req);
  req.flash('success', 'Pengguna berhasil diperbarui');
  res.redirect('/admin/users');
};

exports.destroy = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (user && user.role !== 'admin') {
      await user.destroy();
      logUser(req.user, 'delete', user.id, { username: user.username, nama_lengkap: user.nama_lengkap, role: user.role }, req);
      req.flash('success', 'Pengguna berhasil dihapus');
    } else {
      req.flash('error', 'Admin tidak dapat dihapus');
    }
  } catch (err) {
    req.flash('error', 'Tidak dapat menghapus pengguna: data ini masih digunakan');
  }
  res.redirect('/admin/users');
};

const { Layanan, DeviceCategory } = require('../models');
const { logLayanan } = require('../utils/logger');

exports.index = async (req, res) => {
  const layanans = await Layanan.findAll({
    include: [{ model: DeviceCategory, as: 'kategori' }],
    order: [['created_at', 'ASC']]
  });
  res.render('admin/layanan', { title: 'Daftar Layanan', layanans });
};

exports.create = async (req, res) => {
  res.render('admin/layanan_form', { title: 'Tambah Layanan', layanan: null });
};

exports.store = async (req, res) => {
  try {
    const { nama_layanan, kode, deskripsi } = req.body;
    if (!nama_layanan || !kode) {
      req.flash('error', 'Nama layanan dan kode wajib diisi');
      return res.redirect('/admin/layanan/create');
    }
    const existing = await Layanan.findOne({ where: { kode: kode.trim().toLowerCase() } });
    if (existing) {
      req.flash('error', 'Kode layanan sudah digunakan');
      return res.redirect('/admin/layanan/create');
    }
    const newLayanan = await Layanan.create({
      nama_layanan: nama_layanan.trim(),
      kode: kode.trim().toLowerCase(),
      deskripsi: deskripsi || ''
    });
    logLayanan(req.user, 'create', newLayanan.id, { nama_layanan, kode }, req);
    req.flash('success', 'Layanan berhasil ditambahkan');
    res.redirect('/admin/layanan');
  } catch (err) {
    console.error('Store layanan error:', err.message);
    req.flash('error', 'Gagal menyimpan layanan');
    res.redirect('/admin/layanan/create');
  }
};

exports.edit = async (req, res) => {
  const layanan = await Layanan.findByPk(req.params.id);
  if (!layanan) {
    req.flash('error', 'Layanan tidak ditemukan');
    return res.redirect('/admin/layanan');
  }
  res.render('admin/layanan_form', { title: 'Edit Layanan', layanan });
};

exports.update = async (req, res) => {
  try {
    const layanan = await Layanan.findByPk(req.params.id);
    if (!layanan) {
      req.flash('error', 'Layanan tidak ditemukan');
      return res.redirect('/admin/layanan');
    }
    const { nama_layanan, kode, deskripsi, is_active } = req.body;
    if (!nama_layanan || !kode) {
      req.flash('error', 'Nama layanan dan kode wajib diisi');
      return res.redirect('/admin/layanan/' + req.params.id + '/edit');
    }
    const existing = await Layanan.findOne({ where: { kode: kode.trim().toLowerCase(), id: { '$ne': layanan.id } } });
    if (existing) {
      req.flash('error', 'Kode layanan sudah digunakan');
      return res.redirect('/admin/layanan/' + req.params.id + '/edit');
    }
    await layanan.update({
      nama_layanan: nama_layanan.trim(),
      kode: kode.trim().toLowerCase(),
      deskripsi: deskripsi || '',
      is_active: is_active === 'on'
    });
    logLayanan(req.user, 'update', layanan.id, { nama_layanan, kode, is_active }, req);
    req.flash('success', 'Layanan berhasil diperbarui');
    res.redirect('/admin/layanan');
  } catch (err) {
    console.error('Update layanan error:', err.message);
    req.flash('error', 'Gagal memperbarui layanan');
    res.redirect('/admin/layanan');
  }
};

exports.destroy = async (req, res) => {
  try {
    const layanan = await Layanan.findByPk(req.params.id);
    if (!layanan) {
      req.flash('error', 'Layanan tidak ditemukan');
      return res.redirect('/admin/layanan');
    }
    const catCount = await DeviceCategory.count({ where: { id_layanan: layanan.id } });
    if (catCount > 0) {
      req.flash('error', 'Tidak dapat menghapus layanan yang masih memiliki kategori');
      return res.redirect('/admin/layanan');
    }
    logLayanan(req.user, 'delete', layanan.id, { nama_layanan: layanan.nama_layanan, kode: layanan.kode }, req);
    await layanan.destroy();
    req.flash('success', 'Layanan berhasil dihapus');
    res.redirect('/admin/layanan');
  } catch (err) {
    console.error('Destroy layanan error:', err.message);
    req.flash('error', 'Gagal menghapus layanan');
    res.redirect('/admin/layanan');
  }
};

const { PreventiveMaintenance, DeviceCategory, User, Asset } = require('../models');
const { Op } = require('sequelize');
const { logPM } = require('../utils/logger');

exports.index = async (req, res) => {
  const { status, frekuensi } = req.query;
  const where = {};
  if (status) where.status = status;
  if (frekuensi) where.frekuensi = frekuensi;

  const pms = await PreventiveMaintenance.findAll({
    where,
    include: [
      { model: Asset, as: 'asset' },
      { model: DeviceCategory, as: 'kategori' },
      { model: User, as: 'teknisi' }
    ],
    order: [['berikutnya', 'ASC']]
  });

  const today = new Date().toISOString().split('T')[0];
  const enriched = pms.map(pm => {
    const obj = pm.toJSON();
    if (pm.status === 'aktif' && pm.berikutnya && pm.berikutnya <= today) {
      obj.status_label = 'terlambat';
    } else if (pm.status === 'aktif') {
      obj.status_label = 'on_track';
    } else {
      obj.status_label = pm.status;
    }
    return obj;
  });

  res.render('admin/pm', {
    title: 'Preventive Maintenance',
    pms: enriched,
    filters: { status, frekuensi }
  });
};

exports.create = async (req, res) => {
  const users = await User.findAll({ where: { role: 'teknisi' }, order: [['nama_lengkap', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
  const assets = await Asset.findAll({ order: [['nama_perangkat', 'ASC']] });
  res.render('admin/pm_form', { title: 'Tambah Jadwal PM', pm: null, users, categories, assets });
};

exports.store = async (req, res) => {
  try {
    const { nama_perangkat, deskripsi, frekuensi, hari_interval, terakhir_dilakukan, id_teknisi_default, status, catatan, id_asset, id_kategori } = req.body;

    if (!nama_perangkat || !nama_perangkat.trim()) {
      req.flash('error', 'Nama perangkat wajib diisi');
      return res.redirect('/admin/pm/create');
    }

    const interval = parseInt(hari_interval) || 30;
    let berikutnya = null;
    if (terakhir_dilakukan) {
      const d = new Date(terakhir_dilakukan);
      d.setDate(d.getDate() + interval);
      berikutnya = d.toISOString().split('T')[0];
    }

    const pm = await PreventiveMaintenance.create({
      nama_perangkat: nama_perangkat.trim(),
      deskripsi: (deskripsi || '').trim(),
      frekuensi: frekuensi || 'bulanan',
      hari_interval: interval,
      terakhir_dilakukan: terakhir_dilakukan || null,
      berikutnya,
      id_teknisi_default: id_teknisi_default || null,
      status: status || 'aktif',
      catatan: (catatan || '').trim(),
      id_asset: id_asset || null,
      id_kategori: id_kategori || null
    });

    logPM(req.user, 'create', pm.id, { nama_perangkat: pm.nama_perangkat, frekuensi, interval: hari_interval }, req);
    req.flash('success', 'Jadwal PM berhasil ditambahkan');
    res.redirect('/admin/pm');
  } catch (err) {
    console.error('Store PM error:', err.message);
    req.flash('error', 'Gagal menambahkan jadwal PM');
    res.redirect('/admin/pm/create');
  }
};

exports.edit = async (req, res) => {
  const pm = await PreventiveMaintenance.findByPk(req.params.id);
  if (!pm) {
    req.flash('error', 'Jadwal PM tidak ditemukan');
    return res.redirect('/admin/pm');
  }
  const users = await User.findAll({ where: { role: 'teknisi' }, order: [['nama_lengkap', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
  const assets = await Asset.findAll({ order: [['nama_perangkat', 'ASC']] });
  res.render('admin/pm_form', { title: 'Edit Jadwal PM', pm, users, categories, assets });
};

exports.update = async (req, res) => {
  try {
    const pm = await PreventiveMaintenance.findByPk(req.params.id);
    if (!pm) {
      req.flash('error', 'Jadwal PM tidak ditemukan');
      return res.redirect('/admin/pm');
    }

    const { nama_perangkat, deskripsi, frekuensi, hari_interval, terakhir_dilakukan, id_teknisi_default, status, catatan, id_asset, id_kategori } = req.body;

    const interval = parseInt(hari_interval) || pm.hari_interval;
    let berikutnya = pm.berikutnya;
    if (terakhir_dilakukan && terakhir_dilakukan !== pm.terakhir_dilakukan) {
      const d = new Date(terakhir_dilakukan);
      d.setDate(d.getDate() + interval);
      berikutnya = d.toISOString().split('T')[0];
    }

    await pm.update({
      nama_perangkat: (nama_perangkat || pm.nama_perangkat).trim(),
      deskripsi: (deskripsi || '').trim(),
      frekuensi: frekuensi || pm.frekuensi,
      hari_interval: interval,
      terakhir_dilakukan: terakhir_dilakukan || pm.terakhir_dilakukan,
      berikutnya,
      id_teknisi_default: id_teknisi_default || null,
      status: status || pm.status,
      catatan: (catatan || '').trim(),
      id_asset: id_asset || null,
      id_kategori: id_kategori || null
    });

    logPM(req.user, 'update', pm.id, { nama_perangkat: pm.nama_perangkat, status: pm.status }, req);
    req.flash('success', 'Jadwal PM berhasil diperbarui');
    res.redirect('/admin/pm');
  } catch (err) {
    console.error('Update PM error:', err.message);
    req.flash('error', 'Gagal memperbarui jadwal PM');
    res.redirect('/admin/pm');
  }
};

exports.destroy = async (req, res) => {
  try {
    const pm = await PreventiveMaintenance.findByPk(req.params.id);
    if (pm) {
      logPM(req.user, 'delete', pm.id, { nama_perangkat: pm.nama_perangkat }, req);
      await pm.destroy();
    }
    req.flash('success', 'Jadwal PM berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Tidak dapat menghapus jadwal PM');
  }
  res.redirect('/admin/pm');
};

exports.complete = async (req, res) => {
  try {
    const pm = await PreventiveMaintenance.findByPk(req.params.id);
    if (!pm) {
      req.flash('error', 'Jadwal PM tidak ditemukan');
      return res.redirect('/admin/pm');
    }

    const today = new Date().toISOString().split('T')[0];
    const d = new Date(today);
    d.setDate(d.getDate() + pm.hari_interval);
    const berikutnya = d.toISOString().split('T')[0];

    await pm.update({
      terakhir_dilakukan: today,
      berikutnya,
      status: 'aktif'
    });

    const { broadcastNotification } = require('../utils/socket');
    const { User } = require('../models');
    const admins = await User.findAll({ where: { role: 'admin' } });
    for (const admin of admins) {
      await broadcastNotification(admin.id, 'PM Selesai: ' + pm.nama_perangkat,
        `Maintenance berhasil diselesaikan. Jadwal berikutnya: ${berikutnya}`, '/admin/pm/' + pm.id);
    }

    logPM(req.user, 'complete', pm.id, { nama_perangkat: pm.nama_perangkat, berikutnya }, req);
    req.flash('success', 'Maintenance berhasil ditandai selesai. Jadwal berikutnya: ' + berikutnya);
    res.redirect('/admin/pm');
  } catch (err) {
    console.error('Complete PM error:', err.message);
    req.flash('error', 'Gagal menyelesaikan maintenance');
    res.redirect('/admin/pm');
  }
};

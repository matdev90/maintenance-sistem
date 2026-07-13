const { Op } = require('sequelize');
const QRCode = require('qrcode');
const { Asset, Unit, DeviceCategory } = require('../models');
const { logAsset } = require('../utils/logger');

exports.index = async (req, res) => {
  const { unit, kategori, kondisi, q, page } = req.query;
  const limit = 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (unit) where.id_unit = unit;
  if (kategori) where.id_kategori = kategori;
  if (kondisi) where.kondisi = kondisi;
  if (q) {
    where[Op.or] = [
      { kode_asset: { [Op.like]: '%' + q + '%' } },
      { nama_perangkat: { [Op.like]: '%' + q + '%' } },
      { merk: { [Op.like]: '%' + q + '%' } },
      { serial_number: { [Op.like]: '%' + q + '%' } }
    ];
  }

  const { count, rows: assets } = await Asset.findAndCountAll({
    where,
    include: [
      { model: Unit, as: 'unit' },
      { model: DeviceCategory, as: 'kategori' }
    ],
    order: [['created_at', 'DESC']],
    limit, offset
  });

  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });

  res.render('admin/assets', {
    title: 'Manajemen Aset',
    assets, units, categories,
    filters: { unit, kategori, kondisi, q },
    pagination: { total: count, totalPages: Math.ceil(count / limit), currentPage: parseInt(page) || 1, limit }
  });
};

async function generateKodeAsset() {
  const last = await Asset.findOne({
    order: [['id', 'DESC']],
    attributes: ['kode_asset']
  });
  let nextNum = 1;
  if (last && last.kode_asset) {
    const match = last.kode_asset.match(/AST-(\d+)/);
    if (match) nextNum = parseInt(match[1]) + 1;
  }
  return 'AST-' + String(nextNum).padStart(4, '0');
}

exports.create = async (req, res) => {
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
  const nextKodeAsset = await generateKodeAsset();
  res.render('admin/asset_form', { title: 'Tambah Aset', asset: null, units, categories, nextKodeAsset });
};

exports.store = async (req, res) => {
  try {
    const { kode_asset, nama_perangkat, id_kategori, id_unit, lokasi_detail, merk, model, serial_number, tahun_pembelian, kondisi } = req.body;

    if (!kode_asset || !kode_asset.trim()) {
      req.flash('error', 'Kode aset wajib diisi');
      return res.redirect('/admin/assets/create');
    }
    if (!nama_perangkat || !nama_perangkat.trim()) {
      req.flash('error', 'Nama perangkat wajib diisi');
      return res.redirect('/admin/assets/create');
    }

    const existing = await Asset.findOne({ where: { kode_asset: kode_asset.trim() } });
    if (existing) {
      req.flash('error', 'Kode aset sudah digunakan');
      return res.redirect('/admin/assets/create');
    }

    const asset = await Asset.create({
      kode_asset: kode_asset.trim(),
      nama_perangkat: nama_perangkat.trim(),
      id_kategori: id_kategori || null,
      id_unit: id_unit || null,
      lokasi_detail: (lokasi_detail || '').trim(),
      merk: (merk || '').trim(),
      model: (model || '').trim(),
      serial_number: (serial_number || '').trim(),
      tahun_pembelian: tahun_pembelian ? parseInt(tahun_pembelian) : null,
      kondisi: kondisi || 'baik',
      foto: req.file ? req.file.filename : null
    });

    const qrData = JSON.stringify({
      kode: asset.kode_asset,
      nama: asset.nama_perangkat,
      unit: asset.id_unit,
      id: asset.id
    });
    const qrCode = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
    asset.qr_code = qrCode;
    await asset.save();

    logAsset(req.user, 'create', asset.id, { kode_asset: asset.kode_asset, nama_perangkat: asset.nama_perangkat }, req);
    req.flash('success', 'Aset berhasil ditambahkan');
    res.redirect('/admin/assets');
  } catch (err) {
    console.error('Store asset error:', err.message);
    req.flash('error', 'Gagal menambahkan aset');
    res.redirect('/admin/assets/create');
  }
};

exports.edit = async (req, res) => {
  const asset = await Asset.findByPk(req.params.id);
  if (!asset) {
    req.flash('error', 'Aset tidak ditemukan');
    return res.redirect('/admin/assets');
  }
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
  res.render('admin/asset_form', { title: 'Edit Aset', asset, units, categories });
};

exports.update = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (!asset) {
      req.flash('error', 'Aset tidak ditemukan');
      return res.redirect('/admin/assets');
    }

    const { kode_asset, nama_perangkat, id_kategori, id_unit, lokasi_detail, merk, model, serial_number, tahun_pembelian, kondisi } = req.body;

    if (kode_asset && kode_asset.trim() !== asset.kode_asset) {
      const existing = await Asset.findOne({ where: { kode_asset: kode_asset.trim() } });
      if (existing) {
        req.flash('error', 'Kode aset sudah digunakan');
        return res.redirect('/admin/assets/edit/' + asset.id);
      }
    }

    await asset.update({
      kode_asset: (kode_asset || asset.kode_asset).trim(),
      nama_perangkat: (nama_perangkat || asset.nama_perangkat).trim(),
      id_kategori: id_kategori || asset.id_kategori,
      id_unit: id_unit || asset.id_unit,
      lokasi_detail: (lokasi_detail || '').trim(),
      merk: (merk || '').trim(),
      model: (model || '').trim(),
      serial_number: (serial_number || '').trim(),
      tahun_pembelian: tahun_pembelian ? parseInt(tahun_pembelian) : asset.tahun_pembelian,
      kondisi: kondisi || asset.kondisi,
      foto: req.file ? req.file.filename : asset.foto
    });

    const qrData = JSON.stringify({
      kode: asset.kode_asset,
      nama: asset.nama_perangkat,
      unit: asset.id_unit,
      id: asset.id
    });
    const qrCode = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
    asset.qr_code = qrCode;
    await asset.save();

    logAsset(req.user, 'update', asset.id, { kode_asset: asset.kode_asset, nama_perangkat: asset.nama_perangkat }, req);
    req.flash('success', 'Aset berhasil diperbarui');
    res.redirect('/admin/assets');
  } catch (err) {
    console.error('Update asset error:', err.message);
    req.flash('error', 'Gagal memperbarui aset');
    res.redirect('/admin/assets');
  }
};

exports.destroy = async (req, res) => {
  try {
    const asset = await Asset.findByPk(req.params.id);
    if (asset) {
      logAsset(req.user, 'delete', asset.id, { kode_asset: asset.kode_asset, nama_perangkat: asset.nama_perangkat }, req);
      await asset.destroy();
    }
    req.flash('success', 'Aset berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Tidak dapat menghapus aset');
  }
  res.redirect('/admin/assets');
};

exports.qrcode = async (req, res) => {
  const asset = await Asset.findByPk(req.params.id);
  if (!asset) {
    req.flash('error', 'Aset tidak ditemukan');
    return res.redirect('/admin/assets');
  }

  if (!asset.qr_code) {
    const qrData = JSON.stringify({
      kode: asset.kode_asset,
      nama: asset.nama_perangkat,
      unit: asset.id_unit,
      id: asset.id
    });
    asset.qr_code = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
    await asset.save();
  }

  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });

  res.render('admin/asset_qr', {
    title: 'QR Code Aset - ' + asset.kode_asset,
    asset, units, categories
  });
};

exports.scan = async (req, res) => {
  res.render('admin/asset_scan', { title: 'Scan QR Code Aset' });
};

exports.lookup = async (req, res) => {
  const { kode } = req.query;
  if (!kode) return res.json({ found: false });

  const asset = await Asset.findOne({
    where: { kode_asset: kode.trim().toUpperCase() },
    include: [
      { model: Unit, as: 'unit' },
      { model: DeviceCategory, as: 'kategori' }
    ]
  });

  if (!asset) return res.json({ found: false });
  res.json({
    found: true,
    id: asset.id,
    kode_asset: asset.kode_asset,
    nama_perangkat: asset.nama_perangkat,
    id_unit: asset.id_unit,
    nama_unit: asset.unit ? asset.unit.nama_unit : '',
    id_kategori: asset.id_kategori,
    nama_kategori: asset.kategori ? asset.kategori.nama_kategori : '',
    merk: asset.merk,
    model: asset.model,
    kondisi: asset.kondisi
  });
};

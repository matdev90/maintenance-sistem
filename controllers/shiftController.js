const { Op } = require('sequelize');
const { ShiftSchedule, User, Layanan } = require('../models');
const { logShift } = require('../utils/logger');

exports.index = async (req, res) => {
  const { bulan, tahun, teknisi } = req.query;
  const now = new Date();
  const filterBulan = bulan ? parseInt(bulan) : now.getMonth() + 1;
  const filterTahun = tahun ? parseInt(tahun) : now.getFullYear();

  const where = {};
  const startDate = `${filterTahun}-${String(filterBulan).padStart(2, '0')}-01`;
  const endMonth = filterBulan === 12 ? 1 : filterBulan + 1;
  const endYear = filterBulan === 12 ? filterTahun + 1 : filterTahun;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  where.tanggal = { [Op.gte]: startDate, [Op.lt]: endDate };

  if (teknisi) where.id_teknisi = teknisi;

  const shifts = await ShiftSchedule.findAll({
    where,
    include: [
      { model: User, as: 'teknisi', attributes: ['id', 'nama_lengkap'] },
      { model: Layanan, as: 'layanan', attributes: ['id', 'nama_layanan'] }
    ],
    order: [['tanggal', 'ASC'], ['jam_mulai', 'ASC']]
  });

  const technicians = await User.findAll({
    where: { role: 'teknisi' },
    order: [['nama_lengkap', 'ASC']]
  });

  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });

  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  res.render('admin/shifts', {
    title: 'Jadwal Shift Teknisi',
    shifts, technicians, layanans, months,
    filters: { bulan: filterBulan, tahun: filterTahun, teknisi: teknisi || '' }
  });
};

exports.create = async (req, res) => {
  const technicians = await User.findAll({
    where: { role: 'teknisi' },
    order: [['nama_lengkap', 'ASC']]
  });
  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });
  res.render('admin/shift_form', { title: 'Tambah Jadwal Shift', shift: null, technicians, layanans });
};

exports.store = async (req, res) => {
  try {
    const { tanggal_mulai, tanggal_selesai, id_teknisi, id_layanan, shift, jam_mulai, jam_selesai, catatan } = req.body;

    if (!id_teknisi || !id_teknisi.length) {
      req.flash('error', 'Pilih minimal satu teknisi');
      return res.redirect('/admin/shifts/create');
    }

    const teknisiIds = Array.isArray(id_teknisi) ? id_teknisi : [id_teknisi];
    logShift(req.user, 'store_bulk', null, { teknisi: teknisiIds, id_layanan, shift, tanggal_mulai, tanggal_selesai }, req);
    const tglMulai = new Date(tanggal_mulai);
    const tglSelesai = tanggal_selesai ? new Date(tanggal_selesai) : tglMulai;
    const entries = [];

    for (let d = new Date(tglMulai); d <= tglSelesai; d.setDate(d.getDate() + 1)) {
      const tglStr = d.toISOString().split('T')[0];
      for (const tid of teknisiIds) {
        entries.push({
          id_teknisi: parseInt(tid),
          id_layanan: id_layanan ? parseInt(id_layanan) : null,
          tanggal: tglStr,
          shift: shift || 'pagi',
          jam_mulai: jam_mulai || null,
          jam_selesai: jam_selesai || null,
          catatan: (catatan || '').trim() || null
        });
      }
    }

    await ShiftSchedule.bulkCreate(entries);
    req.flash('success', `Berhasil menambahkan ${entries.length} jadwal shift`);
    res.redirect('/admin/shifts');
  } catch (err) {
    console.error('Store shift error:', err.message);
    req.flash('error', 'Gagal menambahkan jadwal shift');
    res.redirect('/admin/shifts/create');
  }
};

exports.edit = async (req, res) => {
  const shift = await ShiftSchedule.findByPk(req.params.id);
  if (!shift) {
    req.flash('error', 'Jadwal shift tidak ditemukan');
    return res.redirect('/admin/shifts');
  }
  const technicians = await User.findAll({
    where: { role: 'teknisi' },
    order: [['nama_lengkap', 'ASC']]
  });
  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });
  res.render('admin/shift_form', { title: 'Edit Jadwal Shift', shift, technicians, layanans });
};

exports.update = async (req, res) => {
  try {
    const shift = await ShiftSchedule.findByPk(req.params.id);
    if (!shift) {
      req.flash('error', 'Jadwal shift tidak ditemukan');
      return res.redirect('/admin/shifts');
    }

    const { id_teknisi, id_layanan, tanggal, shift: shiftType, jam_mulai, jam_selesai, catatan } = req.body;

    await shift.update({
      id_teknisi: id_teknisi ? parseInt(id_teknisi) : shift.id_teknisi,
      id_layanan: id_layanan ? parseInt(id_layanan) : shift.id_layanan,
      tanggal: tanggal || shift.tanggal,
      shift: shiftType || shift.shift,
      jam_mulai: jam_mulai || shift.jam_mulai,
      jam_selesai: jam_selesai || shift.jam_selesai,
      catatan: (catatan || '').trim() || null
    });

    logShift(req.user, 'update', shift.id, { id_teknisi, shift: shiftType, tanggal }, req);
    req.flash('success', 'Jadwal shift berhasil diperbarui');
    res.redirect('/admin/shifts');
  } catch (err) {
    console.error('Update shift error:', err.message);
    req.flash('error', 'Gagal memperbarui jadwal shift');
    res.redirect('/admin/shifts');
  }
};

exports.destroy = async (req, res) => {
  try {
    const shift = await ShiftSchedule.findByPk(req.params.id);
    if (shift) {
      logShift(req.user, 'delete', shift.id, { id_teknisi: shift.id_teknisi, tanggal: shift.tanggal }, req);
      await shift.destroy();
    }
    req.flash('success', 'Jadwal shift berhasil dihapus');
  } catch (err) {
    req.flash('error', 'Tidak dapat menghapus jadwal shift');
  }
  res.redirect('/admin/shifts');
};

exports.calendar = async (req, res) => {
  const { bulan, tahun, teknisi } = req.query;
  const now = new Date();
  const m = bulan ? parseInt(bulan) : now.getMonth() + 1;
  const y = tahun ? parseInt(tahun) : now.getFullYear();

  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const endMonth = m === 12 ? 1 : m + 1;
  const endYear = m === 12 ? y + 1 : y;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const where = { tanggal: { [Op.gte]: startDate, [Op.lt]: endDate } };
  if (teknisi) where.id_teknisi = teknisi;

  const shifts = await ShiftSchedule.findAll({
    where,
    include: [{ model: User, as: 'teknisi', attributes: ['id', 'nama_lengkap'] }]
  });

  const events = shifts.map(s => ({
    id: s.id,
    title: `${s.teknisi ? s.teknisi.nama_lengkap : ''} - ${s.shift}`,
    start: s.tanggal,
    color: { pagi: '#0d6efd', siang: '#fd7e14', malam: '#6f42c1', libur: '#6c757d' }[s.shift] || '#0d6efd',
    extendedProps: { shift: s.shift, teknisi: s.teknisi ? s.teknisi.nama_lengkap : '' }
  }));

  res.json(events);
};

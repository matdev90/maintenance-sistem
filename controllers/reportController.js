const { Op } = require('sequelize');
const { Report, Unit, DeviceCategory, User, SlaTarget, ReportTracking, Rating, Layanan } = require('../models');
const { autoAssignReport } = require('../utils/autoAssign');
const { broadcastNotification } = require('../utils/socket');
const { notifyReportWhatsApp } = require('../utils/whatsapp');
const { notifyAllTeknisi, notifyAllAdmins, emitDisplayUpdate } = require('../utils/helpers');
const { checkMaxTasks } = require('../utils/activeTask');
const { logReport } = require('../utils/logger');

exports.index = async (req, res) => {
  const { unit, status, prioritas, dari, sampai, q, page } = req.query;
  const limit = 15;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (req.user.role === 'pelapor') where.id_pelapor = req.user.id;

  const filter = {};
  if (unit) filter.id_unit = unit;
  if (status) filter.status = status;
  if (prioritas) filter.prioritas = prioritas;
  if (dari && sampai) {
    filter.created_at = { [Op.between]: [new Date(dari), new Date(sampai + ' 23:59:59')] };
  }
  if (q) {
    filter[Op.or] = [
      { nama_perangkat: { [Op.like]: '%' + q + '%' } },
      { deskripsi: { [Op.like]: '%' + q + '%' } }
    ];
  }

  const { count, rows: reports } = await Report.findAndCountAll({
    where: { ...where, ...filter },
    include: [
      { model: Unit, as: 'unit' },
      { model: DeviceCategory, as: 'kategori' },
      { model: User, as: 'pelapor' },
      { model: User, as: 'validator' },
      { model: User, as: 'investigator' },
      { model: User, as: 'teknisi' }
    ],
    order: [['created_at', 'DESC']],
    limit, offset
  });

  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const totalPages = Math.ceil(count / limit);
  const currentPage = parseInt(page) || 1;

  res.render('reports/index', {
    title: 'Daftar Laporan',
    reports, units,
    filters: { unit, status, prioritas, dari, sampai, q },
    pagination: { total: count, totalPages, currentPage, limit }
  });
};

exports.create = async (req, res) => {
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
  res.render('reports/create', { title: 'Buat Laporan', units, categories });
};

exports.store = async (req, res) => {
  try {
    const { id_unit, id_kategori, nama_perangkat, deskripsi, prioritas } = req.body;

    const report = await Report.create({
      id_unit, id_kategori, nama_perangkat, deskripsi,
      prioritas: prioritas || 'ringan',
      status: 'dilaporkan',
      id_pelapor: req.user.id,
      foto: req.file ? req.file.filename : null
    });

    logReport(req.user, 'store', report.id, { nama_perangkat, id_unit, id_kategori, prioritas }, req);

    await ReportTracking.create({
      id_report: report.id,
      status: 'dilaporkan',
      catatan: 'Laporan dibuat oleh ' + req.user.nama_lengkap,
      id_user: req.user.id
    });

    const { notifyLaporanBaru } = require('../utils/telegram');
    const unit = await Unit.findByPk(id_unit);
    try {
      await notifyLaporanBaru(report, req.user.nama_lengkap, unit ? unit.nama_unit : '-');
    } catch (e) {
      console.error('Telegram notification failed:', e.message);
    }

    const assignedTech = await autoAssignReport(report);
    if (assignedTech) {
      report.id_teknisi = assignedTech.id;
      await report.save();

      await broadcastNotification(assignedTech.id, 'Laporan Baru #' + report.id,
        `${req.user.nama_lengkap} dari ${unit ? unit.nama_unit : '-'} melaporkan: ${report.nama_perangkat} (Auto-assigned)`,
        '/reports/' + report.id);

      const techProfile = await TechnicianProfile.findOne({ where: { id_user: assignedTech.id } });
      if (techProfile) {
        try { await notifyReportWhatsApp(report, { ...assignedTech.toJSON(), whatsapp_number: techProfile.whatsapp_number }); } catch(e) {}
      }
    }

    await notifyAllTeknisi('Laporan Baru #' + report.id,
      `${req.user.nama_lengkap} dari ${unit ? unit.nama_unit : '-'} melaporkan: ${report.nama_perangkat}`,
      '/reports/' + report.id,
      assignedTech ? assignedTech.id : null);

    req.flash('success', `Laporan #${report.id} berhasil dibuat${assignedTech ? ' (ditugaskan ke ' + assignedTech.nama_lengkap + ')' : ''}`);
    res.redirect('/reports');

    emitDisplayUpdate(report.id, Report, 'kategori');
  } catch (err) {
    console.error('Store report error:', err.message);
    req.flash('error', 'Gagal membuat laporan. Periksa kembali data yang dimasukkan.');
    res.redirect('/reports/create');
  }
};

exports.show = async (req, res) => {
  const report = await Report.findByPk(req.params.id, {
    include: [
      { model: Unit, as: 'unit' },
      { model: DeviceCategory, as: 'kategori' },
      { model: User, as: 'pelapor' },
      { model: User, as: 'validator' },
      { model: User, as: 'investigator' },
      { model: User, as: 'teknisi' },
      { model: ReportTracking, as: 'trackings', include: [{ model: User, as: 'user' }] },
      { model: Rating, as: 'rating' }
    ]
  });

  if (!report) {
    req.flash('error', 'Laporan tidak ditemukan');
    return res.redirect('/reports');
  }

  const teknisi = await User.findAll({ where: { role: 'teknisi' } });
  const slaTargets = await SlaTarget.findAll();

  res.render('reports/show', {
    title: `Laporan #${report.id}`,
    report, teknisi, slaTargets
  });
};

exports.validasi = async (req, res) => {
  const { id } = req.params;
  const { action, alasan_tidak_valid } = req.body;
  const report = await Report.findByPk(id);

  if (!report || report.status !== 'dilaporkan') {
    req.flash('error', 'Laporan tidak dapat divalidasi');
    return res.redirect(`/reports/${id}`);
  }

  if (action === 'valid') {
    report.status = 'divalidasi';
    report.id_validator = req.user.id;
    report.tgl_validasi = new Date();
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'divalidasi',
      catatan: 'Laporan divalidasi oleh ' + req.user.nama_lengkap,
      id_user: req.user.id
    });
  } else {
    report.status = 'tidak_valid';
    report.id_validator = req.user.id;
    report.tgl_validasi = new Date();
    report.alasan_tidak_valid = alasan_tidak_valid || 'Tidak valid';
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'tidak_valid',
      catatan: 'Laporan tidak valid: ' + (alasan_tidak_valid || '-'),
      id_user: req.user.id
    });
  }

  const { notifyStatusChange } = require('../utils/telegram');
  const unit = await Unit.findByPk(report.id_unit);
  try {
    await notifyStatusChange(report, req.user.nama_lengkap, unit ? unit.nama_unit : '-');
  } catch (e) {
    console.error('Telegram notification failed:', e.message);
  }

  if (report.id_pelapor) {
    await broadcastNotification(report.id_pelapor, 'Update Laporan #' + report.id,
      'Status: ' + (action === 'valid' ? 'Divalidasi' : 'Tidak Valid') + ' oleh ' + req.user.nama_lengkap,
      '/reports/' + report.id);
  }

  logReport(req.user, action === 'valid' ? 'validasi' : 'tidak_valid', report.id,
    { status: report.status, alasan: action !== 'valid' ? report.alasan_tidak_valid : null }, req);
  req.flash('success', 'Status laporan berhasil diperbarui');
  res.redirect(`/reports/${id}`);
  emitDisplayUpdate(report.id, Report, 'kategori');
};

exports.investigasi = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findByPk(id);

  if (!report || report.status !== 'divalidasi') {
    req.flash('error', 'Laporan tidak dapat diinvestigasi');
    return res.redirect(`/reports/${id}`);
  }

  report.status = 'investigasi';
  report.id_investigator = req.user.id;
  report.tgl_investigasi = new Date();
  await report.save();

  await ReportTracking.create({
    id_report: id, status: 'investigasi',
    catatan: 'Investigasi oleh ' + req.user.nama_lengkap,
    id_user: req.user.id
  });

  const { notifyStatusChange } = require('../utils/telegram');
  const unit = await Unit.findByPk(report.id_unit);
  try {
    await notifyStatusChange(report, req.user.nama_lengkap, unit ? unit.nama_unit : '-');
  } catch (e) {
    console.error('Telegram notification failed:', e.message);
  }

  if (report.id_pelapor) {
    await broadcastNotification(report.id_pelapor, 'Update Laporan #' + report.id,
      'Status: Investigasi oleh ' + req.user.nama_lengkap,
      '/reports/' + report.id);
  }

  logReport(req.user, 'investigasi', report.id, null, req);
  req.flash('success', 'Laporan dalam investigasi');
  res.redirect(`/reports/${id}`);
  emitDisplayUpdate(report.id, Report, 'kategori');
};

exports.ambilTugas = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findByPk(id);

  if (!report || report.status !== 'investigasi') {
    req.flash('error', 'Tidak dapat mengambil tugas');
    return res.redirect(`/reports/${id}`);
  }

  const taskCheck = await checkMaxTasks(req.user.id);
  if (!taskCheck.allowed) {
    req.flash('error', taskCheck.message);
    return res.redirect(`/reports/${id}`);
  }

  report.status = 'dalam_perbaikan';
  report.id_teknisi = req.user.id;
  report.tgl_mulai_perbaikan = new Date();
  await report.save();

  await ReportTracking.create({
    id_report: id, status: 'dalam_perbaikan',
    catatan: 'Dikerjakan oleh ' + req.user.nama_lengkap,
    id_user: req.user.id
  });

  const { notifyStatusChange } = require('../utils/telegram');
  const unit = await Unit.findByPk(report.id_unit);
  try {
    await notifyStatusChange(report, req.user.nama_lengkap, unit ? unit.nama_unit : '-');
  } catch (e) {
    console.error('Telegram notification failed:', e.message);
  }

  if (report.id_pelapor) {
    await broadcastNotification(report.id_pelapor, 'Update Laporan #' + report.id,
      'Status: Dalam Perbaikan oleh ' + req.user.nama_lengkap,
      '/reports/' + report.id);
  }

  logReport(req.user, 'ambil_tugas', report.id, { status: report.status }, req);
  req.flash('success', 'Tugas telah diambil');
  res.redirect(`/reports/${id}`);
};

exports.selesai = async (req, res) => {
  const { id } = req.params;
  const { catatan_teknisi, action } = req.body;
  const report = await Report.findByPk(id);

  if (!report || !['dalam_perbaikan', 'investigasi'].includes(report.status)) {
    req.flash('error', 'Laporan tidak dapat diselesaikan');
    return res.redirect(`/reports/${id}`);
  }

  if (action === 'selesai') {
    report.status = 'selesai';
    report.tgl_selesai = new Date();
    report.catatan_teknisi = catatan_teknisi || '';
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'selesai',
      catatan: 'Laporan selesai: ' + (catatan_teknisi || '-'),
      id_user: req.user.id
    });
  } else {
    report.status = 'tidak_dapat_diperbaiki';
    report.tgl_selesai = new Date();
    report.catatan_teknisi = catatan_teknisi || '';
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'tidak_dapat_diperbaiki',
      catatan: 'Tidak dapat diperbaiki: ' + (catatan_teknisi || '-'),
      id_user: req.user.id
    });
  }

  const { notifyStatusChange } = require('../utils/telegram');
  const unit = await Unit.findByPk(report.id_unit);
  try {
    await notifyStatusChange(report, req.user.nama_lengkap, unit ? unit.nama_unit : '-');
  } catch (e) {
    console.error('Telegram notification failed:', e.message);
  }

  if (report.id_pelapor) {
    const statusLabel = action === 'selesai' ? 'Selesai' : 'Tidak Dapat Diperbaiki';
    await broadcastNotification(report.id_pelapor, 'Laporan #' + report.id + ' Selesai',
      'Laporan telah ' + statusLabel + ' oleh ' + req.user.nama_lengkap + '. Silakan berikan rating.',
      '/reports/' + report.id);
  }

  await notifyAllAdmins('Laporan #' + report.id + ' Selesai',
    'Status: ' + (action === 'selesai' ? 'Selesai' : 'Tidak Dapat Diperbaiki'),
    '/reports/' + report.id,
    req.user.id);

  logReport(req.user, action === 'selesai' ? 'selesai' : 'tidak_dapat_diperbaiki', report.id,
    { status: report.status, catatan: catatan_teknisi }, req);
  req.flash('success', 'Laporan selesai diproses');
  res.redirect(`/reports/${id}`);
  emitDisplayUpdate(report.id, Report, 'kategori');
};

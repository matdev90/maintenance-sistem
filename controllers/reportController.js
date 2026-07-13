const { Op } = require('sequelize');
const { Report, Unit, DeviceCategory, User, SlaTarget, ReportTracking, Rating, Layanan, TechnicianProfile } = require('../models');
const { autoAssignReport } = require('../utils/autoAssign');
const { broadcastNotification } = require('../utils/socket');
const { notifyReportWhatsApp } = require('../utils/whatsapp');
const { notifyAllTeknisi, notifyAllAdmins, emitDisplayUpdate } = require('../utils/helpers');
const { checkMaxTasks } = require('../utils/activeTask');
const { logReport } = require('../utils/logger');

exports.index = async (req, res) => {
  const { unit, status, prioritas, dari, sampai, q, page } = req.query;
  const limit = 10;
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
  console.log('[STORE] Request received, body:', req.body, 'file:', req.file);
  try {
    const { id_unit, id_kategori, nama_perangkat, deskripsi, prioritas } = req.body;

    const report = await Report.create({
      id_unit, id_kategori, nama_perangkat, deskripsi,
      prioritas: prioritas || 'ringan',
      status: 'dilaporkan',
      id_pelapor: req.user.id,
      foto: req.file ? req.file.filename : null
    });

    console.log('[STORE] Report created:', report.id);

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
    console.error('[STORE ERROR]', err.message, err.stack);
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
      { model: ReportTracking, as: 'trackings', include: [{ model: User, as: 'user' }], order: [['created_at', 'ASC']] },
      { model: Rating, as: 'rating' }
    ]
  });

  if (!report) {
    req.flash('error', 'Laporan tidak ditemukan');
    return res.redirect('/reports');
  }

  if (req.user.role === 'pelapor' && report.id_pelapor !== req.user.id) {
    req.flash('error', 'Anda tidak memiliki akses ke laporan ini');
    return res.redirect('/reports');
  }

  const slaTargets = await SlaTarget.findAll();
  const trackings = report.trackings || [];
  let totalWaktu = null;
  if (report.tgl_selesai) {
    totalWaktu = Math.round((new Date(report.tgl_selesai) - new Date(report.created_at)) / (1000 * 60 * 60));
  }

  res.render('reports/show', {
    title: 'Laporan #' + report.id,
    report, slaTargets, trackings, totalWaktu
  });
};

exports.edit = async (req, res) => {
  const report = await Report.findByPk(req.params.id, { include: [{ model: Unit, as: 'unit' }] });
  if (!report) {
    req.flash('error', 'Laporan tidak ditemukan');
    return res.redirect('/reports');
  }
  if (report.status !== 'dilaporkan' || report.id_validator) {
    req.flash('error', 'Laporan hanya bisa diedit saat berstatus Dilaporkan dan belum divalidasi');
    return res.redirect('/reports/' + report.id);
  }
  if (req.user.role === 'pelapor' && report.id_pelapor !== req.user.id) {
    req.flash('error', 'Anda tidak memiliki akses ke laporan ini');
    return res.redirect('/reports');
  }
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']] });
  res.render('reports/edit', { title: 'Edit Laporan #' + report.id, report, units, categories });
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_unit, id_kategori, nama_perangkat, deskripsi, prioritas } = req.body;
    const report = await Report.findByPk(id);

    if (!report) {
      req.flash('error', 'Laporan tidak ditemukan');
      return res.redirect('/reports');
    }
    if (report.status !== 'dilaporkan' || report.id_validator) {
      req.flash('error', 'Laporan hanya bisa diedit saat berstatus Dilaporkan dan belum divalidasi');
      return res.redirect('/reports/' + id);
    }
    if (req.user.role === 'pelapor' && report.id_pelapor !== req.user.id) {
      req.flash('error', 'Anda tidak memiliki akses ke laporan ini');
      return res.redirect('/reports');
    }

    await report.update({
      id_unit, id_kategori,
      nama_perangkat: nama_perangkat.trim(),
      deskripsi: deskripsi || '',
      prioritas: prioritas || 'ringan',
      foto: req.file ? req.file.filename : report.foto
    });

    logReport(req.user, 'update', report.id, { id_unit, id_kategori, nama_perangkat, prioritas }, req);
    req.flash('success', 'Laporan #' + report.id + ' berhasil diperbarui');
    res.redirect('/reports/' + id);
  } catch (err) {
    console.error('Update report error:', err.message);
    req.flash('error', 'Gagal memperbarui laporan');
    res.redirect('/reports');
  }
};

exports.destroy = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findByPk(id);

    if (!report) {
      req.flash('error', 'Laporan tidak ditemukan');
      return res.redirect('/reports');
    }
    if (report.status !== 'dilaporkan' || report.id_validator) {
      req.flash('error', 'Laporan hanya bisa dihapus saat berstatus Dilaporkan dan belum divalidasi');
      return res.redirect('/reports/' + id);
    }
    if (req.user.role === 'pelapor' && report.id_pelapor !== req.user.id) {
      req.flash('error', 'Anda tidak memiliki akses ke laporan ini');
      return res.redirect('/reports');
    }

    await ReportTracking.destroy({ where: { id_report: id } });

    const { deleteTelegramMessages } = require('../utils/telegram');
    try { await deleteTelegramMessages('report', parseInt(id)); } catch (e) {}

    await report.destroy();

    logReport(req.user, 'delete', id, { id_laporan: report.id }, req);
    req.flash('success', 'Laporan #' + report.id + ' berhasil dihapus');
    res.redirect('/reports');
  } catch (err) {
    console.error('Delete report error:', err.message);
    req.flash('error', 'Gagal menghapus laporan');
    res.redirect('/reports');
  }
};

exports.validasi = async (req, res) => {
  const { id } = req.params;
  const { action, catatan } = req.body;
  const report = await Report.findByPk(id);

  if (!report) {
    req.flash('error', 'Laporan tidak ditemukan');
    return res.redirect('/reports');
  }
  if (report.status !== 'dilaporkan') {
    req.flash('error', 'Laporan tidak dapat divalidasi');
    return res.redirect('/reports/' + id);
  }

  if (action === 'valid') {
    report.status = 'divalidasi';
    report.id_validator = req.user.id;
    report.tgl_validasi = new Date();
    report.catatan_validasi = catatan || '';
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'divalidasi',
      catatan: 'Divalidasi oleh ' + req.user.nama_lengkap + (catatan ? ': ' + catatan : ''),
      id_user: req.user.id
    });

    await broadcastNotification(report.id_pelapor, 'Laporan #' + report.id + ' Divalidasi',
      'Laporan Anda telah divalidasi oleh ' + req.user.nama_lengkap, '/reports/' + id);
    await notifyAllTeknisi('Laporan Divalidasi #' + report.id,
      req.user.nama_lengkap + ' memvalidasi laporan: ' + report.nama_perangkat,
      '/reports/' + id);

    req.flash('success', 'Laporan #' + report.id + ' divalidasi');
  } else {
    report.status = 'tidak_valid';
    report.id_validator = req.user.id;
    report.tgl_validasi = new Date();
    report.alasan_tidak_valid = catatan || '';
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'tidak_valid',
      catatan: 'Tidak valid: ' + (catatan || '-') + ' oleh ' + req.user.nama_lengkap,
      id_user: req.user.id
    });

    await broadcastNotification(report.id_pelapor, 'Laporan #' + report.id + ' Tidak Valid',
      'Laporan Anda dinyatakan tidak valid: ' + (catatan || '-'), '/reports/' + id);

    req.flash('success', 'Laporan #' + report.id + ' dinyatakan tidak valid');
  }
  res.redirect('/reports/' + id);
};

exports.investigasi = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findByPk(id);

  if (!report || report.status !== 'divalidasi') {
    req.flash('error', 'Laporan tidak dapat diinvestigasi');
    return res.redirect('/reports/' + id);
  }

  report.status = 'investigasi';
  report.id_investigator = req.user.id;
  report.tgl_investigasi = new Date();
  await report.save();

  await ReportTracking.create({
    id_report: id, status: 'investigasi',
    catatan: 'Ditinvestigasi oleh ' + req.user.nama_lengkap,
    id_user: req.user.id
  });

  await broadcastNotification(report.id_pelapor, 'Laporan #' + report.id + ' Diinvestigasi',
    'Laporan Anda sedang diinvestigasi oleh ' + req.user.nama_lengkap, '/reports/' + id);

  await notifyAllTeknisi('Laporan Diinvestigasi #' + report.id,
    req.user.nama_lengkap + ' memulai investigasi: ' + report.nama_perangkat,
    '/reports/' + id);

  req.flash('success', 'Laporan #' + report.id + ' masuk tahap investigasi');
  res.redirect('/reports/' + id);
};

exports.ambilTugas = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findByPk(id);

  if (!report || report.status !== 'investigasi') {
    req.flash('error', 'Laporan tidak dapat diambil');
    return res.redirect('/reports/' + id);
  }

  const taskCheck = await checkMaxTasks(req.user.id);
  if (!taskCheck.allowed) {
    req.flash('error', taskCheck.message);
    return res.redirect('/reports/' + id);
  }

  const [affectedRows] = await Report.update(
    { status: 'dalam_perbaikan', id_teknisi: req.user.id },
    { where: { id: id, status: 'investigasi', id_teknisi: null } }
  );

  if (affectedRows === 0) {
    req.flash('error', 'Laporan sudah diambil teknisi lain');
    return res.redirect('/reports/' + id);
  }

  await report.reload();

  await ReportTracking.create({
    id_report: id, status: 'dalam_perbaikan',
    catatan: 'Diambil oleh ' + req.user.nama_lengkap,
    id_user: req.user.id
  });

  await sendReportNotif(report, req.user);

  try {
    const { updateTicketTakenMessages } = require('../utils/telegramBot');
    await updateTicketTakenMessages(report, req.user.nama_lengkap, req.user.id);
  } catch (e) {}

  logReport(req.user, 'ambil_tugas', report.id, { id_laporan: report.id }, req);
  emitDisplayUpdate(report.id, Report, 'kategori');
  req.flash('success', 'Laporan ' + report.id + ' telah diambil');
  res.redirect('/reports/' + id);
};

exports.selesai = async (req, res) => {
  const { id } = req.params;
  const { catatan, action, akar_penyebab, solusi } = req.body;
  const report = await Report.findByPk(id);

  if (!report || !['dalam_perbaikan', 'investigasi', 'reopened'].includes(report.status)) {
    req.flash('error', 'Laporan tidak dapat diselesaikan');
    return res.redirect('/reports/' + id);
  }

  if (action === 'resolve') {
    report.status = 'selesai';
    report.tgl_selesai = new Date();
    if (akar_penyebab) report.akar_penyebab = akar_penyebab.trim();
    if (solusi) report.solusi = solusi.trim();
    if (req.file) report.foto_selesai = req.file.filename;
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'selesai',
      catatan: catatan || 'Laporan diselesaikan',
      id_user: req.user.id
    });
  } else {
    report.status = 'tidak_dapat_diperbaiki';
    report.tgl_selesai = new Date();
    if (akar_penyebab) report.akar_penyebab = akar_penyebab.trim();
    if (solusi) report.solusi = solusi.trim();
    if (req.file) report.foto_selesai = req.file.filename;
    await report.save();

    await ReportTracking.create({
      id_report: id, status: 'tidak_dapat_diperbaiki',
      catatan: 'Tidak dapat diperbaiki: ' + (catatan || '-'),
      id_user: req.user.id
    });
  }

  logReport(req.user, action === 'resolve' ? 'selesai' : 'tidak_dapat', report.id,
    { id_laporan: report.id, status: report.status, akar_penyebab, solusi }, req);
  await sendReportNotif(report, req.user);

  try {
    const { sendTelegramPhoto, sendTelegramDMPhotos } = require('../utils/telegram');
    const unit = await Unit.findByPk(report.id_unit);
    const unitNama = unit ? unit.nama_unit : '-';
    const statusLabel = action === 'resolve' ? 'Selesai' : 'Tidak Dapat Diperbaiki';
    const msg = `<b>LAPORAN ${statusLabel.toUpperCase()}</b>\n\n`
      + `<b>No:</b> #${report.id}\n`
      + `<b>Perangkat:</b> ${report.nama_perangkat}\n`
      + `<b>Unit:</b> ${unitNama}\n`
      + `<b>Oleh:</b> ${req.user.nama_lengkap}\n`
      + (report.solusi ? `<b>Solusi:</b> ${report.solusi}\n` : '');

    if (req.file) {
      const { sendTelegramDMPhotos } = require('../utils/telegram');
      await sendTelegramDMPhotos(req.file.filename, msg);
    } else {
      await sendTelegramNotification(msg);
    }
  } catch (e) { console.error('TG selesai error:', e.message); }

  req.flash('success', 'Laporan #' + report.id + ' berhasil diproses');
  res.redirect('/reports/' + id);
  emitDisplayUpdate(report.id, Report, 'kategori');
};

async function sendReportNotif(report, user) {
  const pelapor = await User.findByPk(report.id_pelapor);
  if (pelapor && pelapor.id !== user.id) {
    await broadcastNotification(pelapor.id, 'Update Laporan #' + report.id,
      'Status: ' + formatStatusReport(report.status) + ' oleh ' + user.nama_lengkap,
      '/reports/' + report.id);
  }
  const admins = await User.findAll({ where: { role: 'admin' } });
  for (const a of admins) {
    if (a.id !== user.id) {
      await broadcastNotification(a.id, 'Update Laporan #' + report.id,
        'Status: ' + formatStatusReport(report.status) + ' oleh ' + user.nama_lengkap,
        '/reports/' + report.id);
    }
  }
  if (report.status === 'selesai' || report.status === 'tidak_dapat_diperbaiki') {
    if (pelapor) {
      await broadcastNotification(pelapor.id, 'Laporan #' + report.id + ' Selesai',
        'Laporan telah ' + formatStatusReport(report.status) + '. Silakan berikan rating.',
        '/reports/' + report.id);
    }
  }
}

async function emitReportDisplayUpdate(reportId) {
  return emitDisplayUpdate(reportId, Report, 'kategori');
}

function formatStatusReport(status) {
  const map = { dilaporkan: 'Dilaporkan', divalidasi: 'Divalidasi', investigasi: 'Investigasi', dalam_perbaikan: 'Dalam Perbaikan', selesai: 'Selesai', tidak_valid: 'Tidak Valid', tidak_dapat_diperbaiki: 'Tidak Dapat Diperbaiki' };
  return map[status] || status;
}

const { Op } = require('sequelize');
const { Report, Ticket, TicketHistory, Unit, User, DeviceCategory } = require('../models');
const { durMs, formatDuration } = require('../utils/helpers');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');

exports.laporanMutu = async (req, res) => {
const { unit, prioritas, dari, sampai, status, page } = req.query;
const limit = 15;
const offset = ((parseInt(page) || 1) - 1) * limit;

  const whereReport = {};
  const whereTicket = {};
  if (unit) { whereReport.id_unit = unit; whereTicket.id_unit = unit; }
  if (req.user.role === 'pelapor') { whereReport.id_unit = req.user.id_unit; whereTicket.id_unit = req.user.id_unit; }
  if (req.user.role === 'teknisi') whereTicket.id_teknisi = req.user.id;
  if (prioritas) { whereReport.prioritas = prioritas; whereTicket.prioritas = prioritas; }
  if (status) { whereReport.status = status; whereTicket.status = status; }
  if (dari && sampai) {
    const dateFilter = { [Op.between]: [new Date(dari), new Date(sampai + ' 23:59:59')] };
    whereReport.created_at = dateFilter;
    whereTicket.created_at = dateFilter;
  }

  const [reports, tickets] = await Promise.all([
    Report.findAll({
      where: whereReport,
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' },
        { model: User, as: 'validator' },
        { model: User, as: 'investigator' },
        { model: User, as: 'teknisi' }
      ],
      order: [['created_at', 'DESC']],
      limit
    }),
    Ticket.findAll({
      where: whereTicket,
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' },
        { model: User, as: 'teknisi' }
      ],
      order: [['created_at', 'DESC']],
      limit
    })
  ]);

  const totalCount = reports.length + tickets.length;
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });

  const reportData = reports.map(r => {
    const responseMs = durMs(r.tgl_validasi, r.created_at);
    const totalMs = durMs(r.tgl_selesai, r.created_at);
    return {
      tipe: 'Laporan',
      no: '#' + r.id,
      unit: r.unit ? r.unit.nama_unit : '-',
      perangkat: r.nama_perangkat,
      prioritas: r.prioritas,
      status: r.status,
      pelapor: r.pelapor ? r.pelapor.nama_lengkap : '-',
      teknisi: r.teknisi ? r.teknisi.nama_lengkap : '-',
      tgl_lapor: r.created_at,
      tgl_ambil: r.tgl_validasi,
      tgl_selesai: r.tgl_selesai,
      responseTime: formatDuration(responseMs),
      totalTime: formatDuration(totalMs)
    };
  });

  // Fetch response times for tickets (when technician took it)
  const ticketIds = tickets.map(t => t.id);
  const ticketHistories = ticketIds.length
    ? await TicketHistory.findAll({
        where: { id_ticket: ticketIds, status: 'in_progress' },
        attributes: ['id_ticket', 'created_at']
      })
    : [];
  const responseTimeMap = {};
  ticketHistories.forEach(h => {
    responseTimeMap[h.id_ticket] = h.created_at;
  });

  const ticketData = tickets.map(t => {
    const tglAmbil = responseTimeMap[t.id] || null;
    const responseMs = durMs(tglAmbil, t.created_at);
    const totalMs = durMs(t.tgl_selesai, t.created_at);
    return {
      tipe: 'Tiket',
      no: t.no_tiket,
      unit: t.unit ? t.unit.nama_unit : '-',
      perangkat: t.subjek,
      prioritas: t.prioritas,
      status: t.status,
      pelapor: t.pelapor ? t.pelapor.nama_lengkap : '-',
      teknisi: t.teknisi ? t.teknisi.nama_lengkap : '-',
      tgl_lapor: t.created_at,
      tgl_ambil: tglAmbil,
      tgl_selesai: t.tgl_selesai,
      responseTime: formatDuration(responseMs),
      totalTime: formatDuration(totalMs)
    };
  });

  const mutuData = [...reportData, ...ticketData].sort((a, b) => new Date(b.tgl_lapor) - new Date(a.tgl_lapor));

  const totalPages = Math.ceil(mutuData.length / limit);
  const currentPage = parseInt(page) || 1;
  const paginatedData = mutuData.slice(0, limit);

  res.render('export/laporan_mutu', {
    title: 'Laporan Mutu Pelayanan',
    data: paginatedData, units, filters: { unit, prioritas, dari, sampai, status },
    querystring, total: totalCount,
    pagination: { total: totalCount, totalPages, currentPage, limit }
  });
};

exports.exportPdf = async (req, res) => {
  const { unit, prioritas, dari, sampai, status } = req.query;
  const where = {};
  if (unit) where.id_unit = unit;
  if (prioritas) where.prioritas = prioritas;
  if (status) where.status = status;
  if (dari && sampai) {
    where.created_at = { [Op.between]: [new Date(dari), new Date(sampai + ' 23:59:59')] };
  }

  const reports = await Report.findAll({
    where,
    include: [
      { model: Unit, as: 'unit' },
      { model: User, as: 'validator' }
    ],
    order: [['created_at', 'DESC']]
  });

  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=laporan-mutu.pdf');
  doc.pipe(res);

  const { Setting } = require('../models');
  const logoS = await Setting.findOne({ where: { setting_key: 'logo_rs' } });
  const namaS = await Setting.findOne({ where: { setting_key: 'nama_rs' } });

  if (logoS && logoS.setting_value) {
    const logoPath = path.join(__dirname, '..', 'public', 'uploads', logoS.setting_value);
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 30, 15, { width: 50 });
    }
  }

  doc.fontSize(16).text(namaS ? namaS.setting_value : 'RSUD', 90, 20, { bold: true });
  doc.fontSize(10).text('Laporan Mutu Pelayanan Maintenance', 90, 40);
  doc.fontSize(8).text(`Periode: ${dari || '-'} s/d ${sampai || '-'}`, 90, 55);

  doc.moveDown(2);
  const tableTop = doc.y;
  const colWidths = [30, 60, 80, 60, 60, 60, 60, 60, 60];

  doc.fontSize(7).font('Helvetica-Bold');
  const headers = ['No', 'Unit', 'Perangkat', 'Prioritas', 'Tgl Lapor', 'Tgl Validasi', 'Response (jam)', 'Tgl Selesai', 'Total (jam)'];
  let x = 30;
  headers.forEach((h, i) => {
    doc.text(h, x, tableTop, { width: colWidths[i], align: 'center' });
    x += colWidths[i];
  });

  doc.moveDown(0.5);
  let y = doc.y;
  doc.font('Helvetica').fontSize(7);

  reports.forEach((r, idx) => {
    const responseTime = r.tgl_validasi && r.created_at
      ? Math.round((new Date(r.tgl_validasi) - new Date(r.created_at)) / (1000 * 60 * 60)) + ' jam'
      : '-';
    const totalTime = r.tgl_selesai && r.created_at
      ? Math.round((new Date(r.tgl_selesai) - new Date(r.created_at)) / (1000 * 60 * 60)) + ' jam'
      : '-';

    x = 30;
    const row = [
      idx + 1,
      r.unit ? r.unit.nama_unit : '-',
      r.nama_perangkat,
      r.prioritas,
      r.created_at ? formatDate(r.created_at) : '-',
      r.tgl_validasi ? formatDate(r.tgl_validasi) : '-',
      responseTime,
      r.tgl_selesai ? formatDate(r.tgl_selesai) : '-',
      totalTime
    ];

    row.forEach((val, i) => {
      doc.text(String(val), x, y, { width: colWidths[i], align: 'center' });
      x += colWidths[i];
    });

    y += 15;
    if (y > 500) {
      doc.addPage();
      y = 30;
    }
  });

  doc.end();
};

exports.exportExcel = async (req, res) => {
  const { unit, prioritas, dari, sampai, status } = req.query;
  const where = {};
  if (unit) where.id_unit = unit;
  if (prioritas) where.prioritas = prioritas;
  if (status) where.status = status;
  if (dari && sampai) {
    where.created_at = { [Op.between]: [new Date(dari), new Date(sampai + ' 23:59:59')] };
  }

  const reports = await Report.findAll({
    where,
    include: [
      { model: Unit, as: 'unit' },
      { model: DeviceCategory, as: 'kategori' },
      { model: User, as: 'pelapor' },
      { model: User, as: 'validator' },
      { model: User, as: 'investigator' },
      { model: User, as: 'teknisi' }
    ],
    order: [['created_at', 'DESC']]
  });

  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Data Laporan
  const sheet1 = workbook.addWorksheet('Data Laporan');
  sheet1.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Unit', key: 'unit', width: 15 },
    { header: 'Kategori', key: 'kategori', width: 15 },
    { header: 'Perangkat', key: 'perangkat', width: 20 },
    { header: 'Deskripsi', key: 'deskripsi', width: 30 },
    { header: 'Prioritas', key: 'prioritas', width: 10 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Pelapor', key: 'pelapor', width: 15 },
    { header: 'Validator', key: 'validator', width: 15 },
    { header: 'Investigator', key: 'investigator', width: 15 },
    { header: 'Teknisi', key: 'teknisi', width: 15 },
    { header: 'Tgl Lapor', key: 'tgl_lapor', width: 18 },
    { header: 'Tgl Validasi', key: 'tgl_validasi', width: 18 },
    { header: 'Tgl Investigasi', key: 'tgl_investigasi', width: 18 },
    { header: 'Tgl Selesai', key: 'tgl_selesai', width: 18 },
    { header: 'Response Time (jam)', key: 'response', width: 18 },
    { header: 'Investigation Time (jam)', key: 'investigation', width: 20 },
    { header: 'Total Time (jam)', key: 'total', width: 15 }
  ];

  reports.forEach((r, idx) => {
    const responseTime = r.tgl_validasi && r.created_at
      ? Math.round((new Date(r.tgl_validasi) - new Date(r.created_at)) / (1000 * 60 * 60))
      : null;
    const investigationTime = r.tgl_investigasi && r.tgl_validasi
      ? Math.round((new Date(r.tgl_investigasi) - new Date(r.tgl_validasi)) / (1000 * 60 * 60))
      : null;
    const totalTime = r.tgl_selesai && r.created_at
      ? Math.round((new Date(r.tgl_selesai) - new Date(r.created_at)) / (1000 * 60 * 60))
      : null;

    sheet1.addRow({
      no: idx + 1,
      unit: r.unit ? r.unit.nama_unit : '-',
      kategori: r.kategori ? r.kategori.nama_kategori : '-',
      perangkat: r.nama_perangkat,
      deskripsi: r.deskripsi || '-',
      prioritas: r.prioritas,
      status: r.status,
      pelapor: r.pelapor ? r.pelapor.nama_lengkap : '-',
      validator: r.validator ? r.validator.nama_lengkap : '-',
      investigator: r.investigator ? r.investigator.nama_lengkap : '-',
      teknisi: r.teknisi ? r.teknisi.nama_lengkap : '-',
      tgl_lapor: r.created_at ? formatDate(r.created_at) : '-',
      tgl_validasi: r.tgl_validasi ? formatDate(r.tgl_validasi) : '-',
      tgl_investigasi: r.tgl_investigasi ? formatDate(r.tgl_investigasi) : '-',
      tgl_selesai: r.tgl_selesai ? formatDate(r.tgl_selesai) : '-',
      response: responseTime,
      investigation: investigationTime,
      total: totalTime
    });
  });

  // Sheet 2: Rekap Mutu
  const sheet2 = workbook.addWorksheet('Rekap Mutu');
  sheet2.columns = [
    { header: 'Unit', key: 'unit', width: 15 },
    { header: 'Jumlah Laporan', key: 'jumlah', width: 15 },
    { header: 'Rata-rata Response (jam)', key: 'avg_response', width: 22 },
    { header: 'Rata-rata Investigasi (jam)', key: 'avg_investigation', width: 24 },
    { header: 'Rata-rata Total (jam)', key: 'avg_total', width: 20 }
  ];

  const unitMap = {};
  reports.forEach(r => {
    const unitName = r.unit ? r.unit.nama_unit : '-';
    if (!unitMap[unitName]) unitMap[unitName] = [];
    unitMap[unitName].push(r);
  });

  Object.entries(unitMap).forEach(([unitName, list]) => {
    const avgResp = list.reduce((sum, r) => {
      const t = r.tgl_validasi && r.created_at ? (new Date(r.tgl_validasi) - new Date(r.created_at)) / (1000 * 60 * 60) : 0;
      return sum + t;
    }, 0) / list.length;

    const avgInvest = list.reduce((sum, r) => {
      const t = r.tgl_investigasi && r.tgl_validasi ? (new Date(r.tgl_investigasi) - new Date(r.tgl_validasi)) / (1000 * 60 * 60) : 0;
      return sum + t;
    }, 0) / list.length;

    const avgTotal = list.reduce((sum, r) => {
      const t = r.tgl_selesai && r.created_at ? (new Date(r.tgl_selesai) - new Date(r.created_at)) / (1000 * 60 * 60) : 0;
      return sum + t;
    }, 0) / list.length;

    sheet2.addRow({
      unit: unitName,
      jumlah: list.length,
      avg_response: Math.round(avgResp * 100) / 100,
      avg_investigation: Math.round(avgInvest * 100) / 100,
      avg_total: Math.round(avgTotal * 100) / 100
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=laporan-mutu.xlsx');
  await workbook.xlsx.write(res);
  res.end();
};

function formatDate(d) {
  const dt = new Date(d);
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0') + ' ' +
    String(dt.getHours()).padStart(2, '0') + ':' +
    String(dt.getMinutes()).padStart(2, '0');
}

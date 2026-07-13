const { Op } = require('sequelize');
const { Report, Ticket, TicketHistory, Unit, User, DeviceCategory, SlaTarget } = require('../models');
const { durMs, formatDuration } = require('../utils/helpers');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');

exports.laporanMutu = async (req, res) => {
  const { unit, prioritas, dari, sampai, status, page } = req.query;
  console.log('[Laporan Mutu] Filters:', { unit, prioritas, dari, sampai, status, role: req.user.role });
  const limit = 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const whereReport = {};
  const whereTicket = {};
  if (unit) { whereReport.id_unit = unit; whereTicket.id_unit = unit; }
  if (req.user.role === 'pelapor') { whereReport.id_unit = req.user.id_unit; whereTicket.id_unit = req.user.id_unit; }
  if (req.user.role === 'teknisi') whereTicket.id_teknisi = req.user.id;
  if (prioritas) { whereReport.prioritas = prioritas; whereTicket.prioritas = prioritas; }
  
  // Default filter: hanya status selesai (completed)
  // Report: 'selesai', Ticket: 'resolved' atau 'closed'
  if (status) {
    whereReport.status = status;
    whereTicket.status = status;
  } else {
    whereReport.status = 'selesai';
    whereTicket.status = { [Op.in]: ['resolved', 'closed'] };
  }
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

  console.log('[Laporan Mutu] Found:', reports.length, 'reports,', tickets.length, 'tickets');

  const totalCount = reports.length + tickets.length;
  const units = await Unit.findAll({ order: [['nama_unit', 'ASC']] });
  const slaTargets = await SlaTarget.findAll();
  const slaMap = {};
  slaTargets.forEach(s => { slaMap[s.prioritas] = s; });
  const ticketSlaMap = { rendah: 'ringan', sedang: 'sedang', tinggi: 'berat', kritis: 'kritis' };

  const reportData = reports.map(r => {
    const responseMs = durMs(r.tgl_validasi, r.created_at);
    const totalMs = durMs(r.tgl_selesai, r.created_at);
    const sla = slaMap[r.prioritas];
    const respHours = responseMs !== null ? Math.round(responseMs / (1000 * 60 * 60)) : null;
    const totalHours = totalMs !== null ? Math.round(totalMs / (1000 * 60 * 60)) : null;
    const slaStatus = sla && respHours !== null && respHours > sla.batas_validasi_jam ? 'violation' : (totalHours !== null && sla && totalHours > sla.batas_selesai_jam ? 'violation' : 'ok');
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
      totalTime: formatDuration(totalMs),
      slaStatus, respHours, totalHours, slaTarget: sla ? { validasi: sla.batas_validasi_jam, selesai: sla.batas_selesai_jam } : null
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
    const slaKey = ticketSlaMap[t.prioritas] || t.prioritas;
    const sla = slaMap[slaKey];
    const respHours = responseMs !== null ? Math.round(responseMs / (1000 * 60 * 60)) : null;
    const totalHours = totalMs !== null ? Math.round(totalMs / (1000 * 60 * 60)) : null;
    const slaStatus = sla && respHours !== null && respHours > sla.batas_validasi_jam ? 'violation' : (totalHours !== null && sla && totalHours > sla.batas_selesai_jam ? 'violation' : 'ok');
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
      totalTime: formatDuration(totalMs),
      slaStatus, respHours, totalHours, slaTarget: sla ? { validasi: sla.batas_validasi_jam, selesai: sla.batas_selesai_jam } : null
    };
  });

  const mutuData = [...reportData, ...ticketData].sort((a, b) => new Date(b.tgl_lapor) - new Date(a.tgl_lapor));

  const totalPages = Math.ceil(mutuData.length / limit);
  const currentPage = parseInt(page) || 1;
  const paginatedData = mutuData.slice(0, limit);

  res.render('export/laporan_mutu', {
    title: 'Laporan Mutu Pelayanan',
    data: paginatedData, units, filters: { unit, prioritas, dari, sampai, status },
    querystring, total: totalCount, slaTargets,
    pagination: { total: totalCount, totalPages, currentPage, limit }
  });
};

exports.exportPdf = async (req, res) => {
  const { unit, prioritas, dari, sampai, status } = req.query;
  console.log('[Export PDF] Filters:', { unit, prioritas, dari, sampai, status });
  const whereReport = {};
  const whereTicket = {};
  if (unit) { whereReport.id_unit = unit; whereTicket.id_unit = unit; }
  if (prioritas) { whereReport.prioritas = prioritas; whereTicket.prioritas = prioritas; }
  if (status) {
    whereReport.status = status;
    whereTicket.status = status;
  } else {
    whereReport.status = 'selesai';
    whereTicket.status = { [Op.in]: ['resolved', 'closed'] };
  }
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
        { model: User, as: 'teknisi' }
      ],
      order: [['created_at', 'DESC']]
    }),
    Ticket.findAll({
      where: whereTicket,
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' },
        { model: User, as: 'teknisi' }
      ],
      order: [['created_at', 'DESC']]
    })
  ]);

  console.log('[Export PDF] Found:', reports.length, 'reports,', tickets.length, 'tickets');

  const ticketIds = tickets.map(t => t.id);
  const ticketHistories = ticketIds.length
    ? await TicketHistory.findAll({ where: { id_ticket: ticketIds, status: 'in_progress' }, attributes: ['id_ticket', 'created_at'] })
    : [];
  const responseTimeMap = {};
  ticketHistories.forEach(h => { responseTimeMap[h.id_ticket] = h.created_at; });

  const allData = [];
  reports.forEach(r => {
    allData.push({
      tipe: 'Laporan',
      unit: r.unit ? r.unit.nama_unit : '-',
      perangkat: r.nama_perangkat,
      prioritas: r.prioritas,
      teknisi: r.teknisi ? r.teknisi.nama_lengkap : '-',
      created_at: r.created_at,
      tgl_validasi: r.tgl_validasi,
      tgl_selesai: r.tgl_selesai
    });
  });
  tickets.forEach(t => {
    allData.push({
      tipe: 'Tiket',
      unit: t.unit ? t.unit.nama_unit : '-',
      perangkat: t.subjek,
      prioritas: t.prioritas,
      teknisi: t.teknisi ? t.teknisi.nama_lengkap : '-',
      created_at: t.created_at,
      tgl_validasi: responseTimeMap[t.id] || null,
      tgl_selesai: t.tgl_selesai
    });
  });
  allData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (allData.length === 0) {
    req.flash('error', 'Tidak ada data laporan untuk periode yang dipilih (' + (dari || '-') + ' s/d ' + (sampai || '-') + ')');
    return res.redirect('/export/laporan-mutu' + (req.query && Object.keys(req.query).length ? '?' + querystring.stringify(req.query) : ''));
  }

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

  doc.fontSize(16).font('Helvetica-Bold').text(namaS ? namaS.setting_value : 'RSUD', 90, 20);
  doc.fontSize(10).font('Helvetica').text('Laporan Mutu Pelayanan Maintenance', 90, 40);
  doc.fontSize(8).text(`Periode: ${dari || '-'} s/d ${sampai || '-'}`, 90, 55);

  doc.moveDown(2);

  const tableLeft = 30;
  const pageWidth = doc.page.width - 60;
  const colWidths = [25, 40, 65, 55, 45, 50, 60, 60, 60, 70];
  const rowHeight = 18;
  const headerHeight = 22;
  const headerBg = '#1a1040';
  const headerFg = '#ffffff';
  const borderColor = '#cccccc';
  const altRowBg = '#f4f6fb';

  const headers = ['No', 'Tipe', 'Unit', 'Perangkat', 'Prioritas', 'Teknisi', 'Tgl Lapor', 'Tgl Diambil', 'Tgl Selesai', 'Total Waktu'];

  function drawHeaderBg(y) {
    doc.save();
    doc.fillColor(headerBg);
    doc.roundedRect(tableLeft, y, pageWidth, headerHeight, 3).fill();
    doc.restore();
  }

  function drawRowBg(y, isAlt) {
    doc.save();
    doc.fillColor(isAlt ? altRowBg : '#ffffff');
    doc.rect(tableLeft, y, pageWidth, rowHeight).fill();
    doc.restore();
  }

  function drawBorders(startY, rowCount) {
    doc.save();
    doc.strokeColor(borderColor).lineWidth(0.5);
    let totalH = headerHeight + rowCount * rowHeight;
    doc.moveTo(tableLeft, startY).lineTo(tableLeft + pageWidth, startY).stroke();
    doc.moveTo(tableLeft, startY + totalH).lineTo(tableLeft + pageWidth, startY + totalH).stroke();
    doc.moveTo(tableLeft, startY).lineTo(tableLeft, startY + totalH).stroke();
    doc.moveTo(tableLeft + pageWidth, startY).lineTo(tableLeft + pageWidth, startY + totalH).stroke();
    for (let i = 1; i < headers.length; i++) {
      let cx = tableLeft;
      for (let j = 0; j < i; j++) cx += colWidths[j];
      doc.moveTo(cx, startY).lineTo(cx, startY + totalH).stroke();
    }
    let lineY = startY + headerHeight;
    for (let r = 0; r < rowCount; r++) {
      doc.moveTo(tableLeft, lineY).lineTo(tableLeft + pageWidth, lineY).stroke();
      lineY += rowHeight;
    }
    doc.restore();
  }

  const tableTop = doc.y;
  drawHeaderBg(tableTop);

  doc.fontSize(7).font('Helvetica-Bold').fillColor(headerFg);
  let x = tableLeft;
  headers.forEach((h, i) => {
    doc.text(h, x + 3, tableTop + 6, { width: colWidths[i] - 6, align: 'center' });
    x += colWidths[i];
  });

  let y = tableTop + headerHeight;
  doc.font('Helvetica').fontSize(7).fillColor('#333333');

  const totalPages = allData.length;
  allData.forEach((r, idx) => {
    const totalMs = (r.tgl_selesai && r.created_at)
      ? new Date(r.tgl_selesai) - new Date(r.created_at)
      : null;
    const totalTime = totalMs !== null ? formatDuration(totalMs) : '-';

    if (y + rowHeight > doc.page.height - 40) {
      doc.addPage();
      y = 30;
      drawHeaderBg(y);
      doc.fontSize(7).font('Helvetica-Bold').fillColor(headerFg);
      x = tableLeft;
      headers.forEach((h, i) => {
        doc.text(h, x + 3, y + 6, { width: colWidths[i] - 6, align: 'center' });
        x += colWidths[i];
      });
      y += headerHeight;
      doc.font('Helvetica').fontSize(7).fillColor('#333333');
    }

    drawRowBg(y, idx % 2 === 1);

    const row = [
      String(idx + 1),
      r.tipe,
      r.unit,
      r.perangkat,
      r.prioritas,
      r.teknisi,
      r.created_at ? formatDate(r.created_at) : '-',
      r.tgl_validasi ? formatDate(r.tgl_validasi) : '-',
      r.tgl_selesai ? formatDate(r.tgl_selesai) : '-',
      totalTime
    ];

    x = tableLeft;
    row.forEach((val, i) => {
      const align = (i === 0 || i === 4 || i === 9) ? 'center' : 'left';
      const px = align === 'center' ? x : x + 3;
      const w = align === 'center' ? colWidths[i] : colWidths[i] - 6;
      doc.text(String(val), px, y + 4, { width: w, align: align });
      x += colWidths[i];
    });

    y += rowHeight;
  });

  drawBorders(tableTop, allData.length);

  doc.end();
};

exports.exportExcel = async (req, res) => {
  const { unit, prioritas, dari, sampai, status } = req.query;
  console.log('[Export Excel] Filters:', { unit, prioritas, dari, sampai, status });
  const whereReport = {};
  const whereTicket = {};
  if (unit) { whereReport.id_unit = unit; whereTicket.id_unit = unit; }
  if (prioritas) { whereReport.prioritas = prioritas; whereTicket.prioritas = prioritas; }
  if (status) {
    whereReport.status = status;
    whereTicket.status = status;
  } else {
    whereReport.status = 'selesai';
    whereTicket.status = { [Op.in]: ['resolved', 'closed'] };
  }
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
        { model: DeviceCategory, as: 'kategori' },
        { model: User, as: 'pelapor' },
        { model: User, as: 'validator' },
        { model: User, as: 'investigator' },
        { model: User, as: 'teknisi' }
      ],
      order: [['created_at', 'DESC']]
    }),
    Ticket.findAll({
      where: whereTicket,
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' },
        { model: User, as: 'teknisi' }
      ],
      order: [['created_at', 'DESC']]
    })
  ]);

  const ticketIds = tickets.map(t => t.id);
  const ticketHistories = ticketIds.length
    ? await TicketHistory.findAll({ where: { id_ticket: ticketIds, status: 'in_progress' }, attributes: ['id_ticket', 'created_at'] })
    : [];
  const responseTimeMap = {};
  ticketHistories.forEach(h => { responseTimeMap[h.id_ticket] = h.created_at; });

  console.log('[Export Excel] Found:', reports.length, 'reports,', tickets.length, 'tickets');

  if (reports.length === 0 && tickets.length === 0) {
    req.flash('error', 'Tidak ada data laporan untuk periode yang dipilih (' + (dari || '-') + ' s/d ' + (sampai || '-') + ')');
    return res.redirect('/export/laporan-mutu' + (req.query && Object.keys(req.query).length ? '?' + querystring.stringify(req.query) : ''));
  }

  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Data Laporan
  const sheet1 = workbook.addWorksheet('Data Laporan');
  sheet1.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Tipe', key: 'tipe', width: 10 },
    { header: 'Unit', key: 'unit', width: 15 },
    { header: 'Kategori', key: 'kategori', width: 15 },
    { header: 'Perangkat', key: 'perangkat', width: 20 },
    { header: 'Deskripsi', key: 'deskripsi', width: 30 },
    { header: 'Prioritas', key: 'prioritas', width: 10 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Pelapor', key: 'pelapor', width: 15 },
    { header: 'Teknisi', key: 'teknisi', width: 15 },
    { header: 'Tgl Lapor', key: 'tgl_lapor', width: 18 },
    { header: 'Tgl Diambil', key: 'tgl_ambil', width: 18 },
    { header: 'Tgl Selesai', key: 'tgl_selesai', width: 18 },
    { header: 'Response Time', key: 'response', width: 22 },
    { header: 'Total Waktu', key: 'total', width: 22 }
  ];

  let rowIdx = 1;
  reports.forEach(r => {
    const responseMs = (r.tgl_validasi && r.created_at)
      ? new Date(r.tgl_validasi) - new Date(r.created_at)
      : null;
    const totalMs = (r.tgl_selesai && r.created_at)
      ? new Date(r.tgl_selesai) - new Date(r.created_at)
      : null;

    sheet1.addRow({
      no: rowIdx++,
      tipe: 'Laporan',
      unit: r.unit ? r.unit.nama_unit : '-',
      kategori: r.kategori ? r.kategori.nama_kategori : '-',
      perangkat: r.nama_perangkat,
      deskripsi: r.deskripsi || '-',
      prioritas: r.prioritas,
      status: r.status,
      pelapor: r.pelapor ? r.pelapor.nama_lengkap : '-',
      teknisi: r.teknisi ? r.teknisi.nama_lengkap : '-',
      tgl_lapor: r.created_at ? formatDate(r.created_at) : '-',
      tgl_ambil: r.tgl_validasi ? formatDate(r.tgl_validasi) : '-',
      tgl_selesai: r.tgl_selesai ? formatDate(r.tgl_selesai) : '-',
      response: responseMs !== null ? formatDuration(responseMs) : '-',
      total: totalMs !== null ? formatDuration(totalMs) : '-'
    });
  });

  tickets.forEach(t => {
    const tglAmbil = responseTimeMap[t.id] || null;
    const responseMs = (tglAmbil && t.created_at)
      ? new Date(tglAmbil) - new Date(t.created_at)
      : null;
    const totalMs = (t.tgl_selesai && t.created_at)
      ? new Date(t.tgl_selesai) - new Date(t.created_at)
      : null;

    sheet1.addRow({
      no: rowIdx++,
      tipe: 'Tiket',
      unit: t.unit ? t.unit.nama_unit : '-',
      kategori: t.kategori || '-',
      perangkat: t.subjek,
      deskripsi: t.deskripsi || '-',
      prioritas: t.prioritas,
      status: t.status,
      pelapor: t.pelapor ? t.pelapor.nama_lengkap : '-',
      teknisi: t.teknisi ? t.teknisi.nama_lengkap : '-',
      tgl_lapor: t.created_at ? formatDate(t.created_at) : '-',
      tgl_ambil: tglAmbil ? formatDate(tglAmbil) : '-',
      tgl_selesai: t.tgl_selesai ? formatDate(t.tgl_selesai) : '-',
      response: responseMs !== null ? formatDuration(responseMs) : '-',
      total: totalMs !== null ? formatDuration(totalMs) : '-'
    });
  });

  // Sheet 2: Rekap Mutu
  const sheet2 = workbook.addWorksheet('Rekap Mutu');
  sheet2.columns = [
    { header: 'Unit', key: 'unit', width: 15 },
    { header: 'Jumlah Laporan', key: 'jumlah', width: 15 },
    { header: 'Rata-rata Response (jam)', key: 'avg_response', width: 22 },
    { header: 'Rata-rata Total (jam)', key: 'avg_total', width: 20 }
  ];

  const allData = [];
  reports.forEach(r => {
    allData.push({
      unit: r.unit ? r.unit.nama_unit : '-',
      tgl_validasi: r.tgl_validasi,
      created_at: r.created_at,
      tgl_selesai: r.tgl_selesai
    });
  });
  tickets.forEach(t => {
    allData.push({
      unit: t.unit ? t.unit.nama_unit : '-',
      tgl_validasi: responseTimeMap[t.id] || null,
      created_at: t.created_at,
      tgl_selesai: t.tgl_selesai
    });
  });

  const unitMap = {};
  allData.forEach(d => {
    if (!unitMap[d.unit]) unitMap[d.unit] = [];
    unitMap[d.unit].push(d);
  });

  Object.entries(unitMap).forEach(([unitName, list]) => {
    const avgResp = list.reduce((sum, d) => {
      const t = d.tgl_validasi && d.created_at ? (new Date(d.tgl_validasi) - new Date(d.created_at)) / (1000 * 60 * 60) : 0;
      return sum + t;
    }, 0) / list.length;

    const avgTotal = list.reduce((sum, d) => {
      const t = d.tgl_selesai && d.created_at ? (new Date(d.tgl_selesai) - new Date(d.created_at)) / (1000 * 60 * 60) : 0;
      return sum + t;
    }, 0) / list.length;

    sheet2.addRow({
      unit: unitName,
      jumlah: list.length,
      avg_response: Math.round(avgResp * 100) / 100,
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

const { Rating, Report, Ticket } = require('../models');
const { notifyAllAdmins } = require('../utils/helpers');
const { logRating } = require('../utils/logger');

exports.storeReportRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { bintang, komentar } = req.body;

    const rating = parseInt(bintang);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      req.flash('error', 'Rating harus antara 1-5 bintang');
      return res.redirect('/reports/' + id);
    }

    const report = await Report.findByPk(id);
    if (!report) {
      req.flash('error', 'Laporan tidak ditemukan');
      return res.redirect('/reports');
    }

    if (!['selesai', 'tidak_dapat_diperbaiki'].includes(report.status)) {
      req.flash('error', 'Laporan belum selesai');
      return res.redirect('/reports/' + id);
    }

    const existing = await Rating.findOne({ where: { id_report: id, id_pelapor: req.user.id } });
    if (existing) {
      await existing.update({ bintang: rating, komentar: komentar || null });
    } else {
      await Rating.create({
        id_report: parseInt(id),
        id_pelapor: req.user.id,
        bintang: rating,
        komentar: komentar || null
      });
    }

    await notifyAllAdmins('Rating Baru', `${req.user.nama_lengkap} memberikan rating ${rating} bintang untuk Laporan #${id}`, '/reports/' + id, req.user.id);
    logRating(req.user, 'report', id, { bintang: rating, existing: !!existing }, req);

    req.flash('success', 'Rating berhasil dikirim. Terima kasih!');
    res.redirect('/reports/' + id);
  } catch (err) {
    console.error('Store report rating error:', err.message);
    req.flash('error', 'Gagal mengirim rating');
    res.redirect('/reports/' + req.params.id);
  }
};

exports.storeTicketRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { bintang, komentar } = req.body;

    const rating = parseInt(bintang);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      req.flash('error', 'Rating harus antara 1-5 bintang');
      return res.redirect('/tickets/' + id);
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      req.flash('error', 'Tiket tidak ditemukan');
      return res.redirect('/tickets');
    }

    if (!['resolved', 'closed'].includes(ticket.status)) {
      req.flash('error', 'Tiket belum selesai');
      return res.redirect('/tickets/' + id);
    }

    const existing = await Rating.findOne({ where: { id_ticket: id, id_pelapor: req.user.id } });
    if (existing) {
      await existing.update({ bintang: rating, komentar: komentar || null });
    } else {
      await Rating.create({
        id_ticket: parseInt(id),
        id_pelapor: req.user.id,
        bintang: rating,
        komentar: komentar || null
      });
    }

    await notifyAllAdmins('Rating Baru', `${req.user.nama_lengkap} memberikan rating ${rating} bintang untuk Tiket ${ticket.no_tiket}`, '/tickets/' + id, req.user.id);
    logRating(req.user, 'ticket', id, { no_tiket: ticket.no_tiket, bintang: rating, existing: !!existing }, req);

    req.flash('success', 'Rating berhasil dikirim. Terima kasih!');
    res.redirect('/tickets/' + id);
  } catch (err) {
    console.error('Store ticket rating error:', err.message);
    req.flash('error', 'Gagal mengirim rating');
    res.redirect('/tickets/' + req.params.id);
  }
};

exports.getReportRatings = async (req, res) => {
  const { id } = req.params;
  const ratings = await Rating.findAll({
    where: { id_report: id },
    include: [{ model: User, as: 'pelapor' }],
    order: [['created_at', 'DESC']]
  });
  res.json({ ratings });
};

exports.getTicketRatings = async (req, res) => {
  const { id } = req.params;
  const ratings = await Rating.findAll({
    where: { id_ticket: id },
    include: [{ model: User, as: 'pelapor' }],
    order: [['created_at', 'DESC']]
  });
  res.json({ ratings });
};

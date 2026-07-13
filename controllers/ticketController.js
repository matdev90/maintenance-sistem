const { Op } = require('sequelize');
const { Ticket, TicketHistory, Unit, User, Rating, TechnicianProfile, TicketTechnician, Report, Layanan, DeviceCategory, SlaTarget } = require('../models');
const { autoAssignTicket } = require('../utils/autoAssign');
const { broadcastNotification } = require('../utils/socket');
const { notifyTicketWhatsApp } = require('../utils/whatsapp');
const { formatStatusTicket, generateTicketNumber, notifyAllTeknisi, notifyAllAdmins, emitDisplayUpdate } = require('../utils/helpers');
const { checkMaxTasks } = require('../utils/activeTask');
const { logTicket } = require('../utils/logger');
const { notifyTeknisiTelegram } = require('../utils/telegramBot');

exports.index = async (req, res) => {
  const { status, prioritas, kategori, q, page } = req.query;
  const limit = 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  const where = {};
  if (req.user.role === 'pelapor') where.id_unit = req.user.id_unit;
  if (req.user.role === 'teknisi') where.id_teknisi = req.user.id;

  const filter = {};
  if (status) filter.status = status;
  if (prioritas) filter.prioritas = prioritas;
  if (kategori) filter.kategori = kategori;
  if (q) {
    filter[Op.or] = [
      { subjek: { [Op.like]: '%' + q + '%' } },
      { deskripsi: { [Op.like]: '%' + q + '%' } },
      { no_tiket: { [Op.like]: '%' + q + '%' } }
    ];
  }

  const { count, rows: tickets } = await Ticket.findAndCountAll({
    where: { ...where, ...filter },
    include: [
      { model: Unit, as: 'unit' },
      { model: User, as: 'pelapor' },
      { model: User, as: 'teknisi' },
      { model: TicketTechnician, as: 'additionalTechnicians', where: { status: 'active' }, required: false,
        include: [{ model: User, as: 'user', attributes: ['id', 'nama_lengkap'] }] }
    ],
    order: [['created_at', 'DESC']],
    limit, offset
  });

  const totalPages = Math.ceil(count / limit);
  const currentPage = parseInt(page) || 1;

  res.render('tickets/index', {
    title: 'Daftar Tiket Laporan',
    tickets, units: await Unit.findAll({ order: [['nama_unit', 'ASC']] }),
    filters: { status, prioritas, kategori, q },
    pagination: { total: count, totalPages, currentPage, limit }
  });
};

exports.data = async (req, res) => {
  try {
    const { status, prioritas, kategori, q } = req.query;

    const where = {};
    if (req.user.role === 'pelapor') where.id_unit = req.user.id_unit;
    if (req.user.role === 'teknisi') where.id_teknisi = req.user.id;

    const filter = {};
    if (status) filter.status = status;
    if (prioritas) filter.prioritas = prioritas;
    if (kategori) filter.kategori = kategori;
    if (q) {
      filter[Op.or] = [
        { subjek: { [Op.like]: '%' + q + '%' } },
        { deskripsi: { [Op.like]: '%' + q + '%' } },
        { no_tiket: { [Op.like]: '%' + q + '%' } }
      ];
    }

    const tickets = await Ticket.findAll({
      where: { ...where, ...filter },
      include: [
        { model: Unit, as: 'unit' },
        { model: User, as: 'pelapor' },
        { model: User, as: 'teknisi' },
        { model: TicketTechnician, as: 'additionalTechnicians', where: { status: 'active' }, required: false,
          include: [{ model: User, as: 'user', attributes: ['id', 'nama_lengkap'] }] }
      ],
      order: [['created_at', 'DESC']],
      limit: 100
    });

    const data = tickets.map(t => {
      const teknisiList = [];
      if (t.teknisi) teknisiList.push(t.teknisi.nama_lengkap);
      if (t.additionalTechnicians) {
        t.additionalTechnicians.forEach(at => {
          if (at.user && at.user.nama_lengkap) teknisiList.push(at.user.nama_lengkap);
        });
      }
      return {
        id: t.id,
        type: 'ticket',
        no: t.no_tiket,
        perangkat: t.subjek,
        deskripsi: t.deskripsi || '',
        unit: t.unit ? t.unit.nama_unit : '-',
        kategori: t.kategori,
        prioritas: t.prioritas,
        status: t.status,
        teknisi: teknisiList.length > 0 ? teknisiList.join(', ') : null,
        pelapor: t.pelapor ? t.pelapor.nama_lengkap : null,
        sumber: t.sumber,
        waktu: t.created_at
      };
    });

    res.json({ items: data });
  } catch (err) {
    console.error('Tickets data error:', err.message);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
};

exports.create = async (req, res) => {
  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });
  const allKategoris = await DeviceCategory.findAll({
    include: [{ model: Layanan, as: 'layanan' }],
    order: [['nama_kategori', 'ASC']]
  });
  const userUnit = req.user.id_unit
    ? (await Unit.findByPk(req.user.id_unit, { attributes: ['nama_unit'] }))?.nama_unit || ''
    : '';
  const isTeknisi = req.user.role === 'teknisi';
  res.render('tickets/create', {
    title: 'Buat Laporan Tiket Baru', layanans, allKategoris, userUnit, isTeknisi
  });
};

exports.store = async (req, res) => {
  try {
    const { subjek, deskripsi, kategori, prioritas, id_unit, sumber, id_kategori, auto_assign } = req.body;

    if (!subjek || !subjek.trim()) {
      req.flash('error', 'Nama perangkat wajib diisi');
      return res.redirect('/tickets/create');
    }

    const no_tiket = await generateTicketNumber();

    // Teknisi bisa auto-assign ke diri sendiri
    const isTeknisi = req.user.role === 'teknisi';
    const autoAssign = isTeknisi && auto_assign === 'on';
    const initialStatus = autoAssign ? 'in_progress' : 'open';
    const initialTeknisi = autoAssign ? req.user.id : null;

    const ticket = await Ticket.create({
      no_tiket,
      subjek: subjek.trim(),
      deskripsi: deskripsi || '',
      kategori: kategori || 'lainnya',
      id_kategori: id_kategori || null,
      prioritas: prioritas || 'sedang',
      sumber: 'web',
      foto: req.file ? req.file.filename : null,
      id_pelapor: req.user.id,
      id_unit: id_unit || null,
      status: initialStatus,
      id_teknisi: initialTeknisi
    });

    logTicket(req.user, 'store', ticket.id, { no_tiket, subjek, id_kategori, prioritas }, req);

    // If auto-assigned to technician, create TicketTechnician record and history
    if (autoAssign) {
      await TicketTechnician.create({
        id_ticket: ticket.id,
        id_user: req.user.id,
        role: 'utama',
        added_by: req.user.id,
        status: 'active'
      });
      await TicketHistory.create({
        id_ticket: ticket.id,
        status: 'in_progress',
        catatan: 'Dikerjakan oleh ' + req.user.nama_lengkap + ' (internal)',
        id_user: req.user.id
      });
    } else {
      await TicketHistory.create({
        id_ticket: ticket.id,
        status: 'open',
        catatan: 'Tiket dibuat oleh ' + req.user.nama_lengkap,
        id_user: req.user.id
      });
    }

    const unit = id_unit ? await Unit.findByPk(id_unit) : null;
    const notifMsg = req.user.nama_lengkap + ' (' + (unit ? unit.nama_unit : '') + '): ' + ticket.subjek;
    
    if (autoAssign) {
      req.flash('success', 'Tiket ' + no_tiket + ' berhasil dibuat & langsung ditangani.');
    } else {
      await notifyAllTeknisi('Tiket Baru ' + no_tiket, notifMsg, '/tickets/' + ticket.id);
      await notifyAllAdmins('Tiket Baru ' + no_tiket, notifMsg, '/tickets/' + ticket.id);
      req.flash('success', 'Tiket ' + no_tiket + ' berhasil dibuat. Teknisi akan menangani.');
    }
    res.redirect('/tickets');

    emitDisplayUpdate(ticket.id, Ticket, 'kategoriDevice');

    // Notify teknisi via Telegram (inline keyboard) - only if not auto-assigned
    if (!autoAssign) {
      try {
        const kategori = id_kategori ? (await DeviceCategory.findByPk(id_kategori)) : null;
        await notifyTeknisiTelegram(ticket, kategori?.nama_kategori || '-', unit?.nama_unit || '-');
      } catch (e) { console.error('Telegram notify error:', e.message); }

      // Notify all teknisi via WhatsApp
      try {
        const allTeknisi = await User.findAll({ where: { role: 'teknisi' } });
        for (const tech of allTeknisi) {
          const profile = await TechnicianProfile.findOne({ where: { id_user: tech.id } });
          if (profile?.whatsapp_number) {
            try { await notifyTicketWhatsApp(ticket, { ...tech.toJSON(), whatsapp_number: profile.whatsapp_number }); } catch(e) {}
          }
        }
      } catch (e) { console.error('WA notify error:', e.message); }
    }
  } catch (err) {
    console.error('Store ticket error:', err.message);
    req.flash('error', 'Gagal membuat tiket. Periksa kembali data.');
    res.redirect('/tickets/create');
  }
};

exports.show = async (req, res) => {
  const ticket = await Ticket.findByPk(req.params.id, {
    include: [
      { model: Unit, as: 'unit' },
      { model: User, as: 'pelapor' },
      { model: User, as: 'teknisi' },
      { model: TicketHistory, as: 'histories', include: [{ model: User, as: 'user' }], order: [['created_at', 'ASC']] },
      { model: Rating, as: 'rating' },
      { model: TicketTechnician, as: 'additionalTechnicians', where: { status: 'active' }, required: false,
        include: [{ model: User, as: 'user', attributes: ['id', 'nama_lengkap', 'username'] }] }
    ]
  });

  if (!ticket) {
    req.flash('error', 'Tiket tidak ditemukan');
    return res.redirect('/tickets');
  }

  if (req.user.role === 'pelapor' && ticket.id_unit !== req.user.id_unit) {
    req.flash('error', 'Anda tidak memiliki akses ke tiket ini');
    return res.redirect('/tickets');
  }
  if (req.user.role === 'teknisi' && ticket.id_teknisi !== req.user.id) {
    req.flash('error', 'Anda tidak memiliki akses ke tiket ini');
    return res.redirect('/tickets');
  }

  const teknisi = await User.findAll({ where: { role: 'teknisi' } });
  const slaTargets = await SlaTarget.findAll();

  res.render('tickets/show', {
    title: 'Tiket Laporan ' + ticket.no_tiket,
    ticket, teknisi, slaTargets
  });
};

exports.ambilTugas = async (req, res) => {
  const { id } = req.params;
  const ticket = await Ticket.findByPk(id);

  if (!ticket || ticket.status !== 'open') {
    req.flash('error', 'Tiket tidak dapat diambil');
    return res.redirect('/tickets/' + id);
  }

  const taskCheck = await checkMaxTasks(req.user.id);
  if (!taskCheck.allowed) {
    req.flash('error', taskCheck.message);
    return res.redirect('/tickets/' + id);
  }

  // Optimistic lock: only assign if still open + no teknisi yet
  const [affectedRows] = await Ticket.update(
    { status: 'in_progress', id_teknisi: req.user.id },
    { where: { id: id, status: 'open', id_teknisi: null } }
  );

  if (affectedRows === 0) {
    req.flash('error', 'Tiket sudah diambil teknisi lain');
    return res.redirect('/tickets/' + id);
  }

  await ticket.reload();

  // Also add as TicketTechnician record
  const existingTT = await TicketTechnician.findOne({
    where: { id_ticket: ticket.id, id_user: req.user.id, status: 'active' }
  });
  if (!existingTT) {
    await TicketTechnician.create({
      id_ticket: ticket.id,
      id_user: req.user.id,
      role: 'utama',
      status: 'active'
    });
  }

  await TicketHistory.create({
    id_ticket: id, status: 'in_progress',
    catatan: 'Dikerjakan oleh ' + req.user.nama_lengkap,
    id_user: req.user.id
  });

  await sendTicketNotif(ticket, req.user);

  try {
    const { updateTicketTakenMessages } = require('../utils/telegramBot');
    await updateTicketTakenMessages(ticket, req.user.nama_lengkap, req.user.id);
  } catch (e) {}

  logTicket(req.user, 'ambil_tugas', ticket.id, { no_tiket: ticket.no_tiket }, req);
  emitTicketDisplayUpdate(ticket.id);
  req.flash('success', 'Tiket ' + ticket.no_tiket + ' telah diambil');
  res.redirect('/tickets/' + id);
};

exports.selesai = async (req, res) => {
  const { id } = req.params;
  const { catatan, action, akar_penyebab, solusi } = req.body;
  const ticket = await Ticket.findByPk(id);

  if (!ticket || !['in_progress', 'open', 'reopened'].includes(ticket.status)) {
    req.flash('error', 'Tiket tidak dapat diselesaikan');
    return res.redirect('/tickets/' + id);
  }

  if (action === 'resolve') {
    ticket.status = 'resolved';
    ticket.tgl_selesai = new Date();
    if (akar_penyebab) ticket.akar_penyebab = akar_penyebab.trim();
    if (solusi) ticket.solusi = solusi.trim();
    if (req.file) ticket.foto_selesai = req.file.filename;
    await ticket.save();

    await TicketHistory.create({
      id_ticket: id, status: 'resolved',
      catatan: catatan || 'Tiket diselesaikan',
      id_user: req.user.id
    });
  } else {
    ticket.status = 'closed';
    ticket.tgl_selesai = new Date();
    if (akar_penyebab) ticket.akar_penyebab = akar_penyebab.trim();
    if (solusi) ticket.solusi = solusi.trim();
    if (req.file) ticket.foto_selesai = req.file.filename;
    await ticket.save();

    await TicketHistory.create({
      id_ticket: id, status: 'closed',
      catatan: 'Tiket ditutup: ' + (catatan || '-'),
      id_user: req.user.id
    });
  }

  logTicket(req.user, action === 'resolve' ? 'selesai' : 'tutup', ticket.id,
    { no_tiket: ticket.no_tiket, status: ticket.status, akar_penyebab, solusi }, req);
  await sendTicketNotif(ticket, req.user);

  try {
    const { sendTelegramPhoto, sendTelegramNotification, sendTelegramDMPhotos, getTelegramConfig } = require('../utils/telegram');
    const config = getTelegramConfig();
    const unit = await Unit.findByPk(ticket.id_unit);
    const unitNama = unit ? unit.nama_unit : '-';
    const statusLabel = action === 'resolve' ? 'Selesai' : 'Ditutup';
    const msg = `<b>TIKET ${statusLabel.toUpperCase()}</b>\n\n`
      + `<b>No:</b> ${ticket.no_tiket}\n`
      + `<b>Perangkat:</b> ${ticket.subjek}\n`
      + `<b>Unit:</b> ${unitNama}\n`
      + `<b> Oleh:</b> ${req.user.nama_lengkap}\n`
      + (ticket.solusi ? `<b>Solusi:</b> ${ticket.solusi}\n` : '');

    if (req.file) {
      if (config.notifyMode === 'dm' || config.notifyMode === 'both') {
        await sendTelegramDMPhotos(req.file.filename, msg);
      }
      if (config.notifyMode === 'group' || config.notifyMode === 'both') {
        const chatId = config.chatId;
        if (chatId) {
          await sendTelegramPhoto(chatId, req.file.filename, msg);
        }
      }
    } else {
      await sendTelegramNotification(msg);
    }
  } catch (e) { console.error('TG selesai error:', e.message); }

  req.flash('success', 'Tiket ' + ticket.no_tiket + ' berhasil diproses');
  res.redirect('/tickets/' + id);
  emitTicketDisplayUpdate(ticket.id);
};

exports.bukaUlang = async (req, res) => {
  const { id } = req.params;
  const { catatan } = req.body;
  const ticket = await Ticket.findByPk(id);

  if (!ticket || ticket.status !== 'resolved') {
    req.flash('error', 'Tiket tidak dapat dibuka ulang');
    return res.redirect('/tickets/' + id);
  }

  ticket.status = 'reopened';
  ticket.tgl_selesai = null;
  await ticket.save();

  await TicketHistory.create({
    id_ticket: id, status: 'reopened',
    catatan: 'Dibuka ulang: ' + (catatan || '-'),
    id_user: req.user.id
  });

  await sendTicketNotif(ticket, req.user);

  logTicket(req.user, 'buka_ulang', ticket.id, { no_tiket: ticket.no_tiket, catatan }, req);
  req.flash('success', 'Tiket ' + ticket.no_tiket + ' dibuka ulang');
  res.redirect('/tickets/' + id);
  emitTicketDisplayUpdate(ticket.id);
};

exports.tambahCatatan = async (req, res) => {
  const { id } = req.params;
  const { catatan } = req.body;
  const ticket = await Ticket.findByPk(id);

  if (!ticket) {
    req.flash('error', 'Tiket tidak ditemukan');
    return res.redirect('/tickets');
  }
  if (!catatan || !catatan.trim()) {
    req.flash('error', 'Catatan tidak boleh kosong');
    return res.redirect('/tickets/' + id);
  }

  await TicketHistory.create({
    id_ticket: id, status: ticket.status,
    catatan: req.user.nama_lengkap + ': ' + catatan.trim(),
    id_user: req.user.id
  });

  req.flash('success', 'Catatan berhasil ditambahkan');
  res.redirect('/tickets/' + id);
};

exports.assignTeknisi = async (req, res) => {
  const { id } = req.params;
  const { id_teknisi } = req.body;
  const ticket = await Ticket.findByPk(id);

  if (!ticket) {
    req.flash('error', 'Tiket tidak ditemukan');
    return res.redirect('/tickets');
  }

  const teknisi = id_teknisi ? await User.findByPk(id_teknisi) : null;
  ticket.id_teknisi = id_teknisi || null;
  await ticket.save();

  // If assigning a different main teknisi, also add as TicketTechnician
  if (id_teknisi) {
    const existing = await TicketTechnician.findOne({
      where: { id_ticket: parseInt(id), id_user: id_teknisi, status: 'active' }
    });
    if (!existing) {
      await TicketTechnician.create({
        id_ticket: parseInt(id),
        id_user: id_teknisi,
        role: 'utama',
        added_by: req.user.id,
        status: 'active'
      });
    }
  }

  logTicket(req.user, 'assign', ticket.id, { no_tiket: ticket.no_tiket, id_teknisi, nama_teknisi: teknisi?.nama_lengkap || null }, req);

  await TicketHistory.create({
    id_ticket: id, status: ticket.status,
    catatan: (teknisi ? 'Ditugaskan ke ' + teknisi.nama_lengkap : 'Teknisi dihapus') + ' oleh ' + req.user.nama_lengkap,
    id_user: req.user.id
  });

  if (teknisi) {
    await Notification.create({
      id_user: teknisi.id,
      title: 'Tiket Ditugaskan ' + ticket.no_tiket,
      message: ticket.subjek,
      link: '/tickets/' + ticket.id
    });
  }

  // Emit real-time update for display monitor and ticket list
  emitDisplayUpdate(ticket.id, Ticket, 'kategoriDevice');

  req.flash('success', 'Teknisi berhasil ditugaskan');
  res.redirect('/tickets/' + id);
};

async function sendTicketNotif(ticket, user) {
  const pelapor = await User.findByPk(ticket.id_pelapor);
  if (pelapor && pelapor.id !== user.id) {
    await broadcastNotification(pelapor.id, 'Update Tiket ' + ticket.no_tiket,
      'Status: ' + formatStatusTicket(ticket.status) + ' oleh ' + user.nama_lengkap,
      '/tickets/' + ticket.id);
  }
  const admins = await User.findAll({ where: { role: 'admin' } });
  for (const a of admins) {
    if (a.id !== user.id) {
      await broadcastNotification(a.id, 'Update Tiket ' + ticket.no_tiket,
        'Status: ' + formatStatusTicket(ticket.status) + ' oleh ' + user.nama_lengkap,
        '/tickets/' + ticket.id);
    }
  }

  // Notify additional technicians
  try {
    const additionalTechs = await TicketTechnician.findAll({
      where: { id_ticket: ticket.id, status: 'active' },
      include: [{ model: User, as: 'user' }]
    });
    for (const at of additionalTechs) {
      if (at.id_user !== user.id) {
        await broadcastNotification(at.id_user, 'Update Tiket ' + ticket.no_tiket,
          'Status: ' + formatStatusTicket(ticket.status) + ' oleh ' + user.nama_lengkap,
          '/tickets/' + ticket.id);
      }
    }
  } catch (e) { console.error('Notify additional techs error:', e.message); }

  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    if (pelapor) {
      await broadcastNotification(pelapor.id, 'Tiket ' + ticket.no_tiket + ' Selesai',
        'Tiket telah ' + formatStatusTicket(ticket.status) + '. Silakan berikan rating.',
        '/tickets/' + ticket.id);
    }
  }
}

async function emitTicketDisplayUpdate(ticketId) {
  return emitDisplayUpdate(ticketId, Ticket, 'kategoriDevice');
}

exports.edit = async (req, res) => {
  const ticket = await Ticket.findByPk(req.params.id, {
    include: [{ model: Unit, as: 'unit' }]
  });
  if (!ticket) {
    req.flash('error', 'Tiket tidak ditemukan');
    return res.redirect('/tickets');
  }
  if (ticket.status !== 'open' || ticket.id_teknisi) {
    req.flash('error', 'Tiket hanya bisa diedit saat berstatus Terbuka dan belum ditangani teknisi');
    return res.redirect('/tickets/' + ticket.id);
  }
  if (req.user.role === 'pelapor' && ticket.id_pelapor !== req.user.id) {
    req.flash('error', 'Anda tidak memiliki akses ke tiket ini');
    return res.redirect('/tickets');
  }
  const layanans = await Layanan.findAll({ where: { is_active: true }, order: [['nama_layanan', 'ASC']] });
  const allKategoris = await DeviceCategory.findAll({
    include: [{ model: Layanan, as: 'layanan' }],
    order: [['nama_kategori', 'ASC']]
  });
  res.render('tickets/edit', { title: 'Edit Tiket ' + ticket.no_tiket, ticket, layanans, allKategoris });
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { subjek, deskripsi, kategori, prioritas, id_kategori } = req.body;
    const ticket = await Ticket.findByPk(id);

    if (!ticket) {
      req.flash('error', 'Tiket tidak ditemukan');
      return res.redirect('/tickets');
    }
    if (ticket.status !== 'open' || ticket.id_teknisi) {
      req.flash('error', 'Tiket hanya bisa diedit saat berstatus Terbuka dan belum ditangani teknisi');
      return res.redirect('/tickets/' + id);
    }
    if (req.user.role === 'pelapor' && ticket.id_pelapor !== req.user.id) {
      req.flash('error', 'Anda tidak memiliki akses ke tiket ini');
      return res.redirect('/tickets');
    }

    await ticket.update({
      subjek: subjek.trim(),
      deskripsi: deskripsi || '',
      kategori: kategori || 'lainnya',
      id_kategori: id_kategori || null,
      prioritas: prioritas || 'sedang',
      foto: req.file ? req.file.filename : ticket.foto
    });

    logTicket(req.user, 'update', ticket.id, { no_tiket: ticket.no_tiket, subjek, prioritas }, req);
    req.flash('success', 'Tiket ' + ticket.no_tiket + ' berhasil diperbarui');
    res.redirect('/tickets/' + id);
  } catch (err) {
    console.error('Update ticket error:', err.message);
    req.flash('error', 'Gagal memperbarui tiket');
    res.redirect('/tickets');
  }
};

exports.destroy = async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await Ticket.findByPk(id);

    if (!ticket) {
      req.flash('error', 'Tiket tidak ditemukan');
      return res.redirect('/tickets');
    }
    if (ticket.status !== 'open' || ticket.id_teknisi) {
      req.flash('error', 'Tiket hanya bisa dihapus saat berstatus Terbuka dan belum ditangani teknisi');
      return res.redirect('/tickets/' + id);
    }
    if (req.user.role === 'pelapor' && ticket.id_pelapor !== req.user.id) {
      req.flash('error', 'Anda tidak memiliki akses ke tiket ini');
      return res.redirect('/tickets');
    }

    await TicketHistory.destroy({ where: { id_ticket: id } });

    const { deleteTelegramMessages } = require('../utils/telegram');
    try { await deleteTelegramMessages('ticket', parseInt(id)); } catch (e) {}

    await ticket.destroy();

    logTicket(req.user, 'delete', id, { no_tiket: ticket.no_tiket }, req);
    req.flash('success', 'Tiket ' + ticket.no_tiket + ' berhasil dihapus');
    res.redirect('/tickets');
  } catch (err) {
    console.error('Delete ticket error:', err.message);
    req.flash('error', 'Gagal menghapus tiket');
    res.redirect('/tickets');
  }
};

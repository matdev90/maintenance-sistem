const { Op } = require('sequelize');
const { Layanan, DeviceCategory, Report, Ticket, Unit, User, TicketTechnician } = require('../models');

exports.index = async (req, res) => {
  const layanan = await Layanan.findOne({ where: { kode: req.params.kode_layanan } });
  if (!layanan) return res.status(404).send('Layanan tidak ditemukan');
  const { getSettings } = require('../server');
  const settings = await getSettings();
  res.render('display/index', { layanan, settings, layout: false });
};

exports.data = async (req, res) => {
  try {
    const layanan = await Layanan.findOne({ where: { kode: req.params.kode_layanan } });
    if (!layanan) return res.status(404).json({ error: 'Layanan tidak ditemukan' });

    const kategoris = await DeviceCategory.findAll({ where: { id_layanan: layanan.id } });
    const kategoriIds = kategoris.map(k => k.id);

    const whereReports = { id_kategori: kategoriIds };
    const whereTickets = { id_kategori: kategoriIds };

    const reports = await Report.findAll({
      where: { ...whereReports, status: { [Op.notIn]: ['selesai', 'tidak_valid'] } },
      include: [
        { model: Unit, as: 'unit' },
        { model: DeviceCategory, as: 'kategori' }
      ],
      order: [['created_at', 'DESC']],
      limit: 20
    });

    const tickets = await Ticket.findAll({
      where: { ...whereTickets, status: { [Op.notIn]: ['resolved', 'closed'] } },
      include: [
        { model: Unit, as: 'unit' },
        { model: DeviceCategory, as: 'kategoriDevice' },
        { model: User, as: 'teknisi' },
        { model: TicketTechnician, as: 'additionalTechnicians', where: { status: 'active' }, required: false,
          include: [{ model: User, as: 'user', attributes: ['id', 'nama_lengkap'] }] }
      ],
      order: [['created_at', 'DESC']],
      limit: 20
    });

    const allItems = [
      ...reports.map(r => ({
        id: r.id,
        type: 'report',
        no: '#' + r.id,
        perangkat: r.nama_perangkat,
        deskripsi: r.deskripsi || '',
        unit: r.unit ? r.unit.nama_unit : '-',
        kategori: r.kategori ? r.kategori.nama_kategori : '-',
        prioritas: r.prioritas,
        status: r.status,
        teknisi: r.teknisi ? r.teknisi.nama_lengkap : null,
        sumber: 'web',
        waktu: r.created_at
      })),
      ...tickets.map(t => {
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
          kategori: t.kategoriDevice ? t.kategoriDevice.nama_kategori : '-',
          prioritas: t.prioritas,
          status: t.status,
          teknisi: teknisiList.length > 0 ? teknisiList.join(', ') : null,
          sumber: t.sumber,
          waktu: t.created_at
        };
      })
    ];

    const priorityOrder = { 'kritis': 0, 'berat': 1, 'tinggi': 1, 'sedang': 2, 'ringan': 3, 'rendah': 3 };
    allItems.sort((a, b) => {
      const pa = priorityOrder[a.prioritas] ?? 4;
      const pb = priorityOrder[b.prioritas] ?? 4;
      if (pa !== pb) return pa - pb;
      return new Date(b.waktu) - new Date(a.waktu);
    });

    const stats = {
      baru: allItems.filter(i => ['dilaporkan', 'open'].includes(i.status)).length,
      proses: allItems.filter(i => ['divalidasi', 'investigasi', 'dalam_perbaikan', 'in_progress', 'reopened'].includes(i.status)).length,
      selesai: await Report.count({ where: { id_kategori: kategoriIds, status: 'selesai' } })
        + await Ticket.count({ where: { id_kategori: kategoriIds, status: { [Op.in]: ['resolved', 'closed'] } } }),
      total: allItems.length + await Report.count({ where: { id_kategori: kategoriIds, status: 'selesai' } })
        + await Ticket.count({ where: { id_kategori: kategoriIds, status: { [Op.in]: ['resolved', 'closed'] } } })
    };

    res.json({ items: allItems, stats });
  } catch (err) {
    console.error('Display data error:', err.message);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
};

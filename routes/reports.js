const express = require('express');
const router = express.Router();
const { Unit, DeviceCategory } = require('../models');
const report = require('../controllers/reportController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');
const upload = require('../config/multer');

router.get('/units-categories', async (req, res) => {
  try {
    const units = await Unit.findAll({ order: [['nama_unit', 'ASC']], attributes: ['id', 'nama_unit'] });
    const categories = await DeviceCategory.findAll({ order: [['nama_kategori', 'ASC']], attributes: ['id', 'nama_kategori'] });
    res.json({ units, categories });
  } catch (e) {
    res.json({ units: [], categories: [] });
  }
});

router.get('/', authenticate, report.index);
router.get('/create', authenticate, report.create);
router.post('/store', authenticate, validateCsrf, upload.single('foto'), report.store);
router.get('/:id', authenticate, report.show);
router.post('/:id/validasi', authenticate, authorize('admin', 'teknisi'), validateCsrf, report.validasi);
router.post('/:id/investigasi', authenticate, authorize('admin', 'teknisi'), validateCsrf, report.investigasi);
router.post('/:id/ambil-tugas', authenticate, authorize('admin', 'teknisi'), validateCsrf, report.ambilTugas);
router.post('/:id/selesai', authenticate, authorize('admin', 'teknisi'), validateCsrf, report.selesai);

module.exports = router;

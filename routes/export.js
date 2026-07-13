const express = require('express');
const router = express.Router();
const exportCtrl = require('../controllers/exportController');
const { authenticate, authorize } = require('../middlewares/auth');

router.get('/laporan-mutu', authenticate, exportCtrl.laporanMutu);
router.get('/export-pdf', authenticate, authorize('admin', 'teknisi'), exportCtrl.exportPdf);
router.get('/export-excel', authenticate, authorize('admin', 'teknisi'), exportCtrl.exportExcel);

module.exports = router;

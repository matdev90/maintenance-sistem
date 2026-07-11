const express = require('express');
const router = express.Router();
const asset = require('../controllers/assetController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');
const upload = require('../config/multer');

router.get('/', authenticate, authorize('admin'), asset.index);
router.get('/create', authenticate, authorize('admin'), asset.create);
router.post('/store', authenticate, authorize('admin'), validateCsrf, upload.single('foto'), asset.store);
router.get('/edit/:id', authenticate, authorize('admin'), asset.edit);
router.post('/update/:id', authenticate, authorize('admin'), validateCsrf, upload.single('foto'), asset.update);
router.post('/delete/:id', authenticate, authorize('admin'), validateCsrf, asset.destroy);
router.get('/:id/qr', authenticate, asset.qrcode);
router.get('/scan', authenticate, asset.scan);
router.get('/lookup', authenticate, asset.lookup);

module.exports = router;

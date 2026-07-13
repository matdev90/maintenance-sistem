const express = require('express');
const router = express.Router();
const layanan = require('../controllers/layananController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');

router.use(authenticate, authorize('admin'));

router.get('/', layanan.index);
router.get('/create', layanan.create);
router.post('/store', validateCsrf, layanan.store);
router.get('/:id/edit', layanan.edit);
router.post('/:id/update', validateCsrf, layanan.update);
router.post('/:id/delete', validateCsrf, layanan.destroy);

module.exports = router;

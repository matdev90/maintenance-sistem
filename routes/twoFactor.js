const express = require('express');
const router = express.Router();
const tf = require('../controllers/twoFactorController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');

router.get('/2fa-verify', tf.verifyPage);
router.post('/2fa-verify', tf.verifyLogin);

router.get('/admin/2fa', authenticate, authorize('admin'), tf.setupPage);
router.post('/admin/2fa/enable', authenticate, authorize('admin'), validateCsrf, tf.enable);
router.post('/admin/2fa/disable', authenticate, authorize('admin'), validateCsrf, tf.disable);

module.exports = router;

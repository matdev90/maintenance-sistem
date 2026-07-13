const express = require('express');
const router = express.Router();
const pm = require('../controllers/pmController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');

router.use(authenticate, authorize('admin'));

router.get('/', pm.index);
router.get('/create', pm.create);
router.post('/store', validateCsrf, pm.store);
router.get('/:id/edit', pm.edit);
router.post('/:id/update', validateCsrf, pm.update);
router.post('/:id/delete', validateCsrf, pm.destroy);
router.post('/:id/complete', validateCsrf, pm.complete);

module.exports = router;

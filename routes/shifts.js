const express = require('express');
const router = express.Router();
const shift = require('../controllers/shiftController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');

router.use(authenticate, authorize('admin'));

router.get('/', shift.index);
router.get('/create', shift.create);
router.post('/store', validateCsrf, shift.store);
router.get('/calendar', shift.calendar);
router.get('/:id/edit', shift.edit);
router.post('/:id/update', validateCsrf, shift.update);
router.post('/:id/delete', validateCsrf, shift.destroy);

module.exports = router;

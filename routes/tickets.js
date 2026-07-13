const express = require('express');
const router = express.Router();
const ticket = require('../controllers/ticketController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');
const upload = require('../config/multer');

router.get('/', authenticate, ticket.index);
router.get('/data', authenticate, ticket.data);
router.get('/create', authenticate, ticket.create);
router.post('/store', authenticate, upload.single('foto'), validateCsrf, ticket.store);
router.get('/:id', authenticate, ticket.show);
router.get('/:id/edit', authenticate, ticket.edit);
router.post('/:id/update', authenticate, upload.single('foto'), validateCsrf, ticket.update);
router.post('/:id/delete', authenticate, validateCsrf, ticket.destroy);
router.post('/:id/ambil-tugas', authenticate, validateCsrf, ticket.ambilTugas);
router.post('/:id/selesai', authenticate, upload.single('foto'), validateCsrf, ticket.selesai);
router.post('/:id/buka-ulang', authenticate, validateCsrf, ticket.bukaUlang);
router.post('/:id/catatan', authenticate, validateCsrf, ticket.tambahCatatan);
router.post('/:id/assign', authenticate, authorize('admin'), validateCsrf, ticket.assignTeknisi);

module.exports = router;

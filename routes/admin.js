const express = require('express');
const router = express.Router();
const admin = require('../controllers/adminController');
const userCtrl = require('../controllers/adminUserController');
const logCtrl = require('../controllers/logController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');
const upload = require('../config/multer');

router.use(authenticate, authorize('admin'));

router.get('/settings', admin.settings);
router.post('/settings', validateCsrf, upload.single('logo_rs'), admin.updateSettings);
router.post('/settings/telegram', validateCsrf, admin.updateTelegram);
router.post('/settings/telegram/test', validateCsrf, admin.testTelegram);
router.post('/settings/sla', validateCsrf, admin.updateSla);
router.post('/settings/whatsapp', validateCsrf, admin.updateWhatsApp);

router.get('/users', userCtrl.index);
router.get('/users/create', userCtrl.create);
router.post('/users/store', validateCsrf, userCtrl.store);
router.get('/users/:id/edit', userCtrl.edit);
router.post('/users/:id/update', validateCsrf, userCtrl.update);
router.post('/users/:id/delete', validateCsrf, userCtrl.destroy);

router.get('/technicians', admin.technicians);
router.get('/technicians/:id/edit', admin.editTechnician);
router.post('/technicians/:id/update', validateCsrf, admin.updateTechnician);

router.get('/units', admin.units);
router.get('/units/create', admin.createUnit);
router.post('/units/store', validateCsrf, admin.storeUnit);
router.get('/units/:id/edit', admin.editUnit);
router.post('/units/:id/update', validateCsrf, admin.updateUnit);
router.post('/units/:id/delete', validateCsrf, admin.destroyUnit);

router.get('/bantuan', admin.bantuan);

router.get('/categories', admin.categories);
router.get('/categories/create', admin.createCategory);
router.post('/categories/store', validateCsrf, admin.storeCategory);
router.get('/categories/:id/edit', admin.editCategory);
router.post('/categories/:id/update', validateCsrf, admin.updateCategory);
router.post('/categories/:id/delete', validateCsrf, admin.destroyCategory);

router.get('/logs', logCtrl.index);
router.get('/logs/:id', logCtrl.show);

module.exports = router;

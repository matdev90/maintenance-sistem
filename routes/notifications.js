const express = require('express');
const router = express.Router();
const notif = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');

router.get('/poll', authenticate, notif.pollUnread);
router.get('/count', authenticate, notif.count);
router.post('/read/:id', authenticate, notif.markRead);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

const { authenticate } = require('../middlewares/auth');
const { rateLimiter } = require('../middlewares/rateLimit');

router.get('/login', auth.loginPage);
router.post('/login', rateLimiter, auth.login);
router.get('/logout', authenticate, auth.logout);

module.exports = router;

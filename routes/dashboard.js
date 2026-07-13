const express = require('express');
const router = express.Router();
const dashboard = require('../controllers/dashboardController');
const { authenticate } = require('../middlewares/auth');

router.get('/', authenticate, dashboard.index);

module.exports = router;

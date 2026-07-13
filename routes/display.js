const express = require('express');
const router = express.Router();
const display = require('../controllers/displayController');

router.get('/:kode_layanan', display.index);
router.get('/:kode_layanan/data', display.data);

module.exports = router;

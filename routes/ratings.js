const express = require('express');
const router = express.Router();
const rating = require('../controllers/ratingController');
const { authenticate } = require('../middlewares/auth');
const { validateCsrf } = require('../middlewares/csrf');

router.post('/reports/:id', authenticate, validateCsrf, rating.storeReportRating);
router.post('/tickets/:id', authenticate, validateCsrf, rating.storeTicketRating);
router.get('/reports/:id/list', authenticate, rating.getReportRatings);
router.get('/tickets/:id/list', authenticate, rating.getTicketRatings);

module.exports = router;

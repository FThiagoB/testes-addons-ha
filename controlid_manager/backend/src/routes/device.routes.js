const { Router } = require('express');
const deviceController = require('../controllers/deviceController');

const router = Router();

router.get('/status', deviceController.getStatus);
router.get('/screenshot', deviceController.getScreenshot);
router.post('/enroll/card', deviceController.enrollCard);
router.post('/enroll/cancel', deviceController.cancelEnroll);

module.exports = router;
const { Router } = require('express');
const deviceRoutes = require('./device.routes');
const usersRoutes = require('./users.routes');

const router = Router();

router.use('/device', deviceRoutes);
router.use('/users', usersRoutes);

module.exports = router;
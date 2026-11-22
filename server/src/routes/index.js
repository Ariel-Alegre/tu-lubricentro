const { Router } = require('express');
const { router: adminRouter } = require('./admin');
const router = Router();
router.use('/api/admin', adminRouter);
router.use('/api/admin/lubricentros', require('./lubricentros'));
router.use('/api/lubricentros', require('./public-lubricentros'));
module.exports = router;

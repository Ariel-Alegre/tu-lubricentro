const { Router } = require('express');
const { router: adminRouter } = require('./admin');
const router = Router();
router.use('/api/admin', adminRouter);
router.use('/api/admin/lubricentros', require('./lubricentros'));
router.use('/api/lubricentros', require('./public-lubricentros'));
router.use('/api/tenant', require('./tenant'));
router.use('/api/history', require('./shared-history'));
module.exports = router;

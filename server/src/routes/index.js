const { Router } = require('express');
const { router: adminRouter } = require('./admin');
const router = Router();
router.use('/api/admin', adminRouter);
module.exports = router;

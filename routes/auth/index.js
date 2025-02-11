// auth/index.js

const express = require('express');
const router = express.Router();

const signupRouter = require('./signup');
const loginRouter = require('./login');
const logoutRouter = require('./logout');

router.use('/signup', signupRouter);
router.use('/login', loginRouter);
router.use('/logout', logoutRouter);

module.exports = router;

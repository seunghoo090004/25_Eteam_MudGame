// routes/auth/index.js

const express = require('express');
const router = express.Router();

const signupRouter = require('./signup');
const loginRouter = require('./login');
const logoutRouter = require('./logout');
const verifyRouter = require('./verify');  // 새로 추가된 인증 라우터

router.use('/signup', signupRouter);
router.use('/login', loginRouter);
router.use('/logout', logoutRouter);
router.use('/verify', verifyRouter);  // 인증 라우트 등록

module.exports = router;
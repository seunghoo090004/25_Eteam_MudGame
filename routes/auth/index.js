// routes/auth/index.js

const express = require('express');
const router = express.Router();

const signupRouter = require('./signup');
const loginRouter = require('./login');
const logoutRouter = require('./logout');
const verifyRouter = require('./verify');
const resetPasswordRouter = require('./reset-password');  // 비밀번호 재설정 라우터 추가

router.use('/signup', signupRouter);
router.use('/login', loginRouter);
router.use('/logout', logoutRouter);
router.use('/verify', verifyRouter);
router.use('/reset-password', resetPasswordRouter);  // 비밀번호 재설정 라우트 등록

module.exports = router;
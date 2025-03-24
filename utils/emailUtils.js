// utils/emailUtils.js
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
    });

    function generateToken() {
    return crypto.randomBytes(32).toString('hex');
    }

    async function sendVerificationEmail(email, token) {
    const verificationUrl = `https://mudgame.up.railway.app/auth/verify?token=${token}`;
    
    return transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: '머드게임 이메일 인증',
        html: `
        <h1>이메일 인증</h1>
        <p>아래 링크를 클릭하여 이메일을 인증해주세요:</p>
        <a href="${verificationUrl}">이메일 인증하기</a>
        `
    });
}

module.exports = { sendVerificationEmail, generateToken };
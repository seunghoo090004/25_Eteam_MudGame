// utils/emailUtils.js
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// 트랜스포터 설정
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// 토큰 생성 함수
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 이메일 발송 함수 (인증 토큰 또는 코드 모두 지원)
async function sendVerificationEmail(email, tokenOrSubject, htmlContent = null) {
  // 첫 번째 방식: 토큰 기반 인증 링크
  if (!htmlContent && typeof tokenOrSubject === 'string' && tokenOrSubject.length > 10) {
    const token = tokenOrSubject;
    const verificationUrl = `https://mudgame.up.railway.app/auth/verify?token=${token}`;
    
    return transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: '머드게임 이메일 인증',
      html: `
        <h1>이메일 인증</h1>
        <p>아래 링크를 클릭하여 이메일을 인증해주세요:</p>
        <a href="${verificationUrl}">이메일 인증하기</a>
        <p>이 링크는 24시간 동안 유효합니다.</p>
      `
    });
  } 
  // 두 번째 방식: 코드 기반 인증 (제목과 HTML 내용 직접 전달)
  else {
    return transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: tokenOrSubject,
      html: htmlContent
    });
  }
}

// 비밀번호 재설정 이메일 발송 함수
async function sendPasswordResetEmail(email, token) {
  const resetUrl = `https://mudgame.up.railway.app/auth/reset-password?token=${token}`;
  
  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: '머드게임 비밀번호 재설정',
    html: `
      <h1>비밀번호 재설정</h1>
      <p>아래 링크를 클릭하여 비밀번호를 재설정하세요:</p>
      <a href="${resetUrl}">비밀번호 재설정하기</a>
      <p>이 링크는 1시간 동안 유효합니다.</p>
      <p>비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하세요.</p>
    `
  });
}

module.exports = { 
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  generateToken 
};
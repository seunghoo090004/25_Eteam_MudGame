// utils/emailUtils.js
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Gmail용 트랜스포터 설정 수정
const transporter = nodemailer.createTransport({
  service: 'gmail',  // Gmail 서비스 명시
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false  // Railway 환경을 위해 추가
  },
  connectionTimeout: 10000,  // 10초로 단축
  greetingTimeout: 10000,
  socketTimeout: 10000
});

// 연결 테스트
transporter.verify(function(error, success) {
  if (error) {
    console.error('SMTP 연결 실패:', error);
    console.log('SMTP 설정:', {
      user: process.env.SMTP_USER,
      passLength: process.env.SMTP_PASS ? process.env.SMTP_PASS.length : 0
    });
  } else {
    console.log('✅ SMTP 서버 연결 성공');
  }
});

// 토큰 생성 함수
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 이메일 발송 함수
async function sendVerificationEmail(email, tokenOrSubject, htmlContent = null) {
  try {
    if (!htmlContent && typeof tokenOrSubject === 'string' && tokenOrSubject.length > 10) {
      const token = tokenOrSubject;
      const verificationUrl = `https://mudgame.up.railway.app/auth/verify?token=${token}`;
      
      return await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: '머드게임 이메일 인증',
        html: `
          <h1>이메일 인증</h1>
          <p>아래 링크를 클릭하여 이메일을 인증해주세요:</p>
          <a href="${verificationUrl}">이메일 인증하기</a>
          <p>이 링크는 24시간 동안 유효합니다.</p>
        `
      });
    } else {
      return await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: tokenOrSubject,
        html: htmlContent
      });
    }
  } catch (error) {
    console.error('이메일 발송 오류:', error);
    throw error;
  }
}

// 비밀번호 재설정 이메일
async function sendPasswordResetEmail(email, token) {
  const resetUrl = `https://mudgame.up.railway.app/auth/reset-password?token=${token}`;
  
  try {
    return await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
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
  } catch (error) {
    console.error('비밀번호 재설정 이메일 발송 오류:', error);
    throw error;
  }
}

module.exports = { 
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  generateToken 
};
// utils/emailUtils.js - Resend API 적용 버전
const crypto = require('crypto');
const { Resend } = require('resend');

// Resend API 초기화
const resend = new Resend(process.env.RESEND_API_KEY || 're_BaVmNAmw_CN6PZKumxcqehQiBbmFk5rsC');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function sendVerificationEmail(email, tokenOrSubject, htmlContent = null) {
  try {
    if (!htmlContent && typeof tokenOrSubject === 'string' && tokenOrSubject.length > 10) {
      const token = tokenOrSubject;
      const verificationUrl = `https://mudgame.up.railway.app/auth/verify?token=${token}`;
      
      const data = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: '머드게임 이메일 인증',
        html: `
          <h1>이메일 인증</h1>
          <p>아래 링크를 클릭하여 이메일을 인증해주세요:</p>
          <a href="${verificationUrl}">이메일 인증하기</a>
          <p>이 링크는 24시간 동안 유효합니다.</p>
        `
      });
      
      console.log('✅ 인증 이메일 발송 성공:', data);
      return data;
    } else {
      const data = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: email,
        subject: tokenOrSubject,
        html: htmlContent
      });
      
      console.log('✅ 이메일 발송 성공:', data);
      return data;
    }
  } catch (error) {
    console.error('❌ Resend 이메일 오류:', error);
    throw error;
  }
}

async function sendPasswordResetEmail(email, token) {
  const resetUrl = `https://mudgame.up.railway.app/auth/reset-password?token=${token}`;
  
  try {
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
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
    
    console.log('✅ 비밀번호 재설정 이메일 발송 성공:', data);
    return data;
  } catch (error) {
    console.error('❌ Resend 이메일 오류:', error);
    throw error;
  }
}

module.exports = { 
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  generateToken 
};
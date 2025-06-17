// utils/emailUtils.js
// 이메일 전송 유틸리티 함수 모음 - 레퍼런스 패턴 적용

'use strict';
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const my_reqinfo = require('./reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

//============================================================================================
// 트랜스포터 설정
//============================================================================================
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

//============================================================================================
function generateToken() {
//============================================================================================
    const LOG_HEADER_TITLE = "GENERATE_TOKEN";
    const LOG_HEADER = "TokenGenerator --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_crypto = -1;
    
    const EXT_data = {};
    
    try {
        //----------------------------------------------------------------------
        // 토큰 생성
        //----------------------------------------------------------------------
        let token;
        try {
            token = crypto.randomBytes(32).toString('hex');
            if (!token || token.length === 0) {
                throw new Error("Token generation failed");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_crypto);
            ret_data = {
                code: LOG_HEADER_TITLE + "(crypto_randomBytes)",
                value: catch_crypto,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // result - 성공 로깅
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                tokenLength: token.length,
                generated: true
            },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        
        return token;
        
    } catch (e) {
        // 예상치 못한 오류 처리
        if (ret_status === 200) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        }
        throw e;
    }
}

//============================================================================================
async function sendVerificationEmail(email, tokenOrSubject, htmlContent = null) {
//============================================================================================
    const LOG_HEADER_TITLE = "SEND_VERIFICATION_EMAIL";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_input_validation = -1;
    const catch_email_preparation = -2;
    const catch_email_send = -3;
    
    const EXT_data = {
        email: my_reqinfo.maskId(email),
        hasHtmlContent: htmlContent !== null,
        tokenOrSubjectLength: tokenOrSubject?.length || 0
    };
    
    try {
        //----------------------------------------------------------------------
        // 입력값 검증
        //----------------------------------------------------------------------
        try {
            if (!email || typeof email !== 'string') {
                throw new Error("Valid email address required");
            }
            if (!tokenOrSubject || typeof tokenOrSubject !== 'string') {
                throw new Error("Token or subject required");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_input_validation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(input_validation)",
                value: catch_input_validation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // 이메일 내용 준비
        //----------------------------------------------------------------------
        let emailOptions;
        try {
            // 첫 번째 방식: 토큰 기반 인증 링크
            if (!htmlContent && typeof tokenOrSubject === 'string' && tokenOrSubject.length > 10) {
                const token = tokenOrSubject;
                const verificationUrl = `https://mudgame.up.railway.app/auth/verify?token=${token}`;
                
                emailOptions = {
                    from: process.env.SMTP_FROM,
                    to: email,
                    subject: '머드게임 이메일 인증',
                    html: `
                        <h1>이메일 인증</h1>
                        <p>아래 링크를 클릭하여 이메일을 인증해주세요:</p>
                        <a href="${verificationUrl}">이메일 인증하기</a>
                        <p>이 링크는 24시간 동안 유효합니다.</p>
                    `
                };
            } 
            // 두 번째 방식: 코드 기반 인증 (제목과 HTML 내용 직접 전달)
            else {
                emailOptions = {
                    from: process.env.SMTP_FROM,
                    to: email,
                    subject: tokenOrSubject,
                    html: htmlContent
                };
            }
            
            if (!emailOptions.from || !emailOptions.to || !emailOptions.subject) {
                throw new Error("Email options preparation failed");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_email_preparation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_preparation)",
                value: catch_email_preparation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // 이메일 전송
        //----------------------------------------------------------------------
        let sendResult;
        try {
            sendResult = await transporter.sendMail(emailOptions);
            
            if (!sendResult || !sendResult.messageId) {
                throw new Error("Email send failed - no message ID returned");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_email_send);
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_send)",
                value: catch_email_send,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // result - 성공 로깅
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                messageId: sendResult.messageId,
                subject: emailOptions.subject,
                sent: true
            },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                messageId: sendResult.messageId,
                subject: emailOptions.subject,
                sent: true
            }
        }, null, 2));
        
        return sendResult;
        
    } catch (e) {
        // 예상치 못한 오류 처리
        if (ret_status === 200) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        }
        throw e;
    }
}

//============================================================================================
async function sendPasswordResetEmail(email, token) {
//============================================================================================
    const LOG_HEADER_TITLE = "SEND_PASSWORD_RESET_EMAIL";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] Token[" + my_reqinfo.maskId(token) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_input_validation = -1;
    const catch_email_preparation = -2;
    const catch_email_send = -3;
    
    const EXT_data = {
        email: my_reqinfo.maskId(email),
        token: my_reqinfo.maskId(token)
    };
    
    try {
        //----------------------------------------------------------------------
        // 입력값 검증
        //----------------------------------------------------------------------
        try {
            if (!email || typeof email !== 'string') {
                throw new Error("Valid email address required");
            }
            if (!token || typeof token !== 'string') {
                throw new Error("Valid token required");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_input_validation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(input_validation)",
                value: catch_input_validation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // 이메일 내용 준비
        //----------------------------------------------------------------------
        let emailOptions;
        try {
            const resetUrl = `https://mudgame.up.railway.app/auth/reset-password?token=${token}`;
            
            emailOptions = {
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
            };
            
            if (!emailOptions.from || !emailOptions.to || !emailOptions.subject) {
                throw new Error("Email options preparation failed");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_email_preparation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_preparation)",
                value: catch_email_preparation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // 이메일 전송
        //----------------------------------------------------------------------
        let sendResult;
        try {
            sendResult = await transporter.sendMail(emailOptions);
            
            if (!sendResult || !sendResult.messageId) {
                throw new Error("Email send failed - no message ID returned");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_email_send);
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_send)",
                value: catch_email_send,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw e;
        }
        
        //----------------------------------------------------------------------
        // result - 성공 로깅
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                messageId: sendResult.messageId,
                resetUrl: resetUrl,
                sent: true
            },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                messageId: sendResult.messageId,
                resetUrlLength: resetUrl.length,
                sent: true
            }
        }, null, 2));
        
        return sendResult;
        
    } catch (e) {
        // 예상치 못한 오류 처리
        if (ret_status === 200) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        }
        throw e;
    }
}

module.exports = { 
    sendVerificationEmail, 
    sendPasswordResetEmail, 
    generateToken 
};
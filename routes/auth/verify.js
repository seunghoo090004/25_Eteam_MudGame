// routes/auth/verify.js
const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');
const { sendVerificationEmail, generateToken } = require('../../utils/emailUtils');
const csrf = require('csurf');

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

// 인증 코드 생성 함수
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6자리 코드
}

// 인증 코드 저장 및 관리를 위한 객체
const verificationCodes = {};

// POST /auth/verify/send-code - 인증 코드 발송
router.post('/send-code', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "SEND_VERIFICATION_CODE";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({
            code: 'INVALID_INPUT',
            msg: '이메일을 입력해주세요.'
        });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // 이미 가입된 이메일인지 확인
        const [existingUsers] = await connection.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUsers.length > 0) {
            return res.status(409).json({
                code: 'EMAIL_EXISTS',
                msg: '이미 가입된 이메일입니다.'
            });
        }
        
        // 인증 코드 생성
        const verificationCode = generateVerificationCode();
        
        // 인증 코드 저장 (실제 환경에서는 DB에 저장하는 것이 좋음)
        verificationCodes[email] = {
            code: verificationCode,
            expires: new Date(Date.now() + 30 * 60 * 1000) // 30분 후 만료
        };
        
        // 이메일 발송
        await sendVerificationEmail(
            email,
            `머드게임 이메일 인증 코드: ${verificationCode}`,
            `<h1>머드게임 이메일 인증</h1>
            <p>안녕하세요! 머드게임 회원가입을 위한 인증 코드입니다.</p>
            <p>인증 코드: <strong>${verificationCode}</strong></p>
            <p>이 코드는 30분 동안 유효합니다.</p>`
        );
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 인증 코드 발송 성공: " + email);
        
        return res.status(200).json({
            code: 'CODE_SENT',
            msg: '인증 코드가 발송되었습니다. 이메일을 확인해주세요.'
        });
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " 오류: " + e.message);
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '인증 코드 발송 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

// POST /auth/verify/check-code - 인증 코드 확인
router.post('/check-code', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "CHECK_VERIFICATION_CODE";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    const { email, code } = req.body;
    
    if (!email || !code) {
        return res.status(400).json({
            code: 'INVALID_INPUT',
            msg: '이메일과 인증 코드를 입력해주세요.'
        });
    }
    
    try {
        // 저장된 인증 코드 확인
        const storedData = verificationCodes[email];
        
        if (!storedData) {
            return res.status(404).json({
                code: 'CODE_NOT_FOUND',
                msg: '인증 코드가 발급되지 않았습니다. 다시 요청해주세요.'
            });
        }
        
        if (new Date() > storedData.expires) {
            delete verificationCodes[email]; // 만료된 코드 삭제
            return res.status(401).json({
                code: 'CODE_EXPIRED',
                msg: '인증 코드가 만료되었습니다. 다시 요청해주세요.'
            });
        }
        
        if (storedData.code !== code) {
            return res.status(401).json({
                code: 'INVALID_CODE',
                msg: '인증 코드가 일치하지 않습니다.'
            });
        }
        
        // 인증 성공 시 인증 상태 업데이트
        verificationCodes[email].verified = true;
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 인증 코드 확인 성공: " + email);
        
        return res.status(200).json({
            code: 'VERIFICATION_SUCCESS',
            msg: '이메일 인증이 완료되었습니다.'
        });
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " 오류: " + e.message);
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '인증 코드 확인 중 오류가 발생했습니다.'
        });
    }
});

// GET /auth/verify - 이메일 인증 링크 처리 (기존 코드)
router.get('/', async(req, res) => {
    const LOG_HEADER_TITLE = "EMAIL_VERIFY";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    const { token } = req.query;
    
    if (!token) {
        console.log(LOG_ERR_HEADER + LOG_HEADER + " 토큰 누락");
        return res.render('verify', { 
            success: false, 
            message: '유효하지 않은 인증 토큰입니다.' 
        });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // 토큰으로 사용자 찾기
        const [users] = await connection.query(
            'SELECT * FROM users WHERE verification_token = ? AND verification_expires > NOW() AND email_verified = FALSE',
            [token]
        );
        
        if (users.length === 0) {
            console.log(LOG_ERR_HEADER + LOG_HEADER + " 유효하지 않거나 만료된 토큰");
            return res.render('verify', { 
                success: false, 
                message: '유효하지 않거나 만료된 토큰입니다. 회원가입을 다시 시도하거나 새 인증 링크를 요청하세요.' 
            });
        }
        
        // 이메일 인증 완료 처리
        await connection.query(
            'UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE user_id = ?',
            [users[0].user_id]
        );
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 사용자 인증 완료: " + users[0].email);
        
        return res.render('verify', { 
            success: true, 
            message: '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.',
            redirectUrl: '/auth/login'
        });
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " 오류: " + e.message);
        return res.render('verify', { 
            success: false, 
            message: '인증 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' 
        });
    } finally {
        if (connection) connection.release();
    }
});

// POST /auth/verify/resend - 인증 이메일 재발송 (기존 코드)
router.post('/resend', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "EMAIL_VERIFY_RESEND";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({
            code: 'INVALID_INPUT',
            msg: '이메일을 입력해주세요.'
        });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // 이메일로 사용자 찾기
        const [users] = await connection.query(
            'SELECT * FROM users WHERE email = ? AND email_verified = FALSE',
            [email]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                code: 'USER_NOT_FOUND',
                msg: '해당 이메일로 등록된 미인증 계정을 찾을 수 없습니다.'
            });
        }
        
        // 새 인증 토큰 생성
        const verificationToken = generateToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 후 만료
        
        // 토큰 업데이트
        await connection.query(
            'UPDATE users SET verification_token = ?, verification_expires = ? WHERE user_id = ?',
            [verificationToken, expiresAt, users[0].user_id]
        );
        
        // 인증 이메일 재발송
        await sendVerificationEmail(email, verificationToken);
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 인증 이메일 재발송: " + email);
        
        return res.status(200).json({
            code: 'VERIFICATION_RESENT',
            msg: '인증 이메일이 재발송되었습니다. 이메일을 확인해주세요.'
        });
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " 오류: " + e.message);
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
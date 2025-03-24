// routes/auth/reset-password.js
const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');
const bcrypt = require('bcrypt');
const csrf = require('csurf');
const { generateToken, sendPasswordResetEmail } = require('../../utils/emailUtils');

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

// GET /auth/reset-password - 비밀번호 재설정 요청 페이지
router.get('/', csrfProtection, function(req, res) {
    // 토큰이 있으면 비밀번호 변경 페이지, 없으면 이메일 입력 페이지
    const { token } = req.query;
    
    if (token) {
        return res.render('reset-password-change', { 
            csrfToken: req.csrfToken(),
            token
        });
    }
    
    res.render('reset-password-request', { 
        csrfToken: req.csrfToken() 
    });
});

// POST /auth/reset-password/request - 비밀번호 재설정 이메일 요청
router.post('/request', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "PASSWORD_RESET_REQUEST";
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
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        // 사용자가 존재하지 않아도 성공 응답 (보안상 이유)
        if (users.length === 0) {
            console.log(LOG_ERR_HEADER + LOG_HEADER + " 요청된 이메일에 해당하는 사용자 없음: " + email);
            
            // 보안상 존재하지 않는 사용자에게도 성공 메시지를 보냄
            return res.status(200).json({
                code: 'RESET_EMAIL_SENT',
                msg: '비밀번호 재설정 이메일이 발송되었습니다. 이메일을 확인해주세요.'
            });
        }
        
        const user = users[0];
        
        // 재설정 토큰 생성
        const resetToken = generateToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 후 만료
        
        // DB에 토큰 저장
        await connection.query(
            'UPDATE users SET reset_token = ?, reset_expires = ? WHERE user_id = ?',
            [resetToken, expiresAt, user.user_id]
        );
        
        // 비밀번호 재설정 이메일 발송
        await sendPasswordResetEmail(email, resetToken);
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 비밀번호 재설정 이메일 발송: " + email);
        
        return res.status(200).json({
            code: 'RESET_EMAIL_SENT',
            msg: '비밀번호 재설정 이메일이 발송되었습니다. 이메일을 확인해주세요.'
        });
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " 오류: " + e.message);
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

// POST /auth/reset-password/change - 새 비밀번호 설정
router.post('/change', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "PASSWORD_RESET_CHANGE";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    const { token, password, passwordConfirm } = req.body;
    
    if (!token || !password || !passwordConfirm) {
        return res.status(400).json({
            code: 'INVALID_INPUT',
            msg: '모든 필드를 입력해주세요.'
        });
    }
    
    if (password !== passwordConfirm) {
        return res.status(400).json({
            code: 'PASSWORD_MISMATCH',
            msg: '비밀번호가 일치하지 않습니다.'
        });
    }
    
    // 비밀번호 유효성 검사
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            code: 'INVALID_PASSWORD',
            msg: '비밀번호는 최소 8자 이상이며, 대문자, 소문자, 숫자를 포함해야 합니다.'
        });
    }
    
    let connection;
    
    try {
        connection = await pool.getConnection();
        
        // 토큰으로 사용자 찾기
        const [users] = await connection.query(
            'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()',
            [token]
        );
        
        if (users.length === 0) {
            return res.status(400).json({
                code: 'INVALID_TOKEN',
                msg: '유효하지 않거나 만료된 토큰입니다. 비밀번호 재설정을 다시 요청해주세요.'
            });
        }
        
        const user = users[0];
        
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // 비밀번호 업데이트 및 토큰 제거
        await connection.query(
            'UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE user_id = ?',
            [hashedPassword, user.user_id]
        );
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 비밀번호 재설정 완료: " + user.email);
        
        return res.status(200).json({
            code: 'PASSWORD_RESET_SUCCESS',
            msg: '비밀번호가 성공적으로 재설정되었습니다. 새 비밀번호로 로그인해주세요.'
        });
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " 오류: " + e.message);
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '비밀번호 재설정 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
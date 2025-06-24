// routes/auth/signup.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');
const { generateToken, sendVerificationEmail } = require('../../utils/emailUtils');

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

// 입력값 검증 함수
function validateSignupInput(username, email, password) {
    const errors = {};
    const usernameRegex = /^[가-힣a-zA-Z]{2,8}$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!username || !usernameRegex.test(username)) {
        errors.username = '닉네임은 2~8자의 한글 또는 영문만 사용 가능합니다.';
    }
    
    if (!email || !emailRegex.test(email)) {
        errors.email = '유효한 이메일 주소를 입력해주세요.';
    }
    
    if (!password || !passwordRegex.test(password)) {
        errors.password = '비밀번호는 최소 8자 이상이며, 대문자, 소문자, 숫자를 포함해야 합니다.';
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

// GET /auth/signup - 회원가입 페이지 렌더링
router.get('/', csrfProtection, function(req, res) {
    // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
    if (req.session.userId) {
        return res.redirect('/');
    }
    // signup.ejs를 렌더링하면서 CSRF 토큰 전달
    res.render('signup', { csrfToken: req.csrfToken() });
});

// POST /auth/signup - 회원가입 처리
router.post('/', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "SIGNUP";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    let connection;
    
    try {
        // 필수 입력값 체크 및 검증
        const { username, email, password, verified } = req.body;
        const validation = validateSignupInput(username, email, password);
        
        if (!validation.isValid) {
            return res.status(400).json({
                code: 'INVALID_INPUT',
                msg: '입력값이 유효하지 않습니다.',
                data: validation.errors
            });
        }
        
        // 이메일 인증 여부 확인 - 클라이언트에서 verified 필드를 전송
        if (!verified) {
            return res.status(403).json({
                code: 'EMAIL_NOT_VERIFIED',
                msg: '이메일 인증이 필요합니다.'
            });
        }
        
        connection = await pool.getConnection();
        
        // 이메일 중복 확인
        const [existingEmails] = await connection.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (existingEmails.length > 0) {
            return res.status(409).json({
                code: 'EMAIL_EXISTS',
                msg: '이미 사용 중인 이메일입니다.'
            });
        }
        
        // 사용자명 중복 확인
        const [existingUsers] = await connection.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (existingUsers.length > 0) {
            return res.status(409).json({
                code: 'USERNAME_EXISTS',
                msg: '이미 사용 중인 닉네임입니다.'
            });
        }
        
        // 비밀번호 해싱
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // DB에 사용자 추가
        const [result] = await connection.query(
            `INSERT INTO users 
            (email, username, password, email_verified, created_at) 
            VALUES (?, ?, ?, TRUE, NOW())`,
            [email, username, hashedPassword]
        );
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " 회원가입 성공: " + username);
        
        return res.status(200).json({
            code: 'SIGNUP_SUCCESS',
            msg: '회원가입이 완료되었습니다.',
            data: { 
                email,
                username,
                id: result.insertId 
            }
        });
        
    } catch (e) {
        // 오류 처리 개선
        const errorCode = e.code || 'SERVER_ERROR';
        const errorStatus = e.status || 500;
        const errorMessage = e.message || '회원가입 처리 중 오류가 발생했습니다.';
        
        console.error(LOG_ERR_HEADER + LOG_HEADER + `[${errorCode}] ==> ${errorMessage}`);
        
        return res.status(errorStatus).json({
            code: errorCode,
            msg: `ERROR: ${errorMessage}`,
            data: e.errors || null
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
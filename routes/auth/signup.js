// routes/auth/signup.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

// 입력값 검증 함수
function validateSignupInput(username, password) {
    const errors = {};
    const usernameRegex = /^[a-zA-Z0-9_]{4,20}$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    
    if (!username || !usernameRegex.test(username)) {
        errors.username = '사용자명은 4-20자의 영문자, 숫자, 밑줄만 사용 가능합니다.';
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
    
    let ret_status = 200;
    let ret_data;
    let connection;
    
    try {
        // 필수 입력값 체크 및 검증
        const { username, password } = req.body;
        const validation = validateSignupInput(username, password);
        
        if (!validation.isValid) {
            ret_status = 400;
            throw {
                code: 'INVALID_INPUT',
                message: '입력값이 유효하지 않습니다.',
                errors: validation.errors,
                status: 400
            };
        }
        
        connection = await pool.getConnection();
        
        // 기존 사용자 검사
        const [existingUser] = await connection.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        if (existingUser.length > 0) {
            ret_status = 409; // Conflict
            throw {
                code: 'USERNAME_EXISTS',
                message: '이미 사용 중인 사용자명입니다.',
                status: 409
            };
        }
        
        // 비밀번호 해싱 - 더 강력한 해싱을 위해 salt 라운드 증가
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // DB에 사용자 추가
        const [result] = await connection.query(
            'INSERT INTO users (username, password, created_at) VALUES (?, ?, NOW())',
            [username, hashedPassword]
        );
        
        ret_data = { 
            username,
            id: result.insertId 
        };
        
    } catch (e) {
        // 오류 처리 개선
        const errorCode = e.code || 'SERVER_ERROR';
        const errorStatus = e.status || 500;
        const errorMessage = e.message || '회원가입 처리 중 오류가 발생했습니다.';
        
        ret_status = errorStatus;
        console.error(LOG_ERR_HEADER + LOG_HEADER + `[${errorCode}] status(${ret_status}) ==> ${errorMessage}`);
        
        return res.status(ret_status).json({
            code: errorCode,
            msg: `ERROR: ${errorMessage}`,
            data: e.errors || null
        });
    } finally {
        if (connection) connection.release();
    }
    
    // 성공 응답
    ret_data = {
        code: 'SIGNUP_SUCCESS',
        msg: "SUCC: 회원가입이 완료되었습니다.",
        data: ret_data
    };
    
    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
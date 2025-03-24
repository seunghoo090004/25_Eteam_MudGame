// routes/auth/login.js
// 사용자 로그인 처리 및 세션 생성
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

// 로그인 시도 로깅 함수
async function logLoginAttempt(connection, username, ip, status, userId = null, errorReason = null) {
    try {
        await connection.query(
            'INSERT INTO login_attempts (user_id, username, ip_address, status, error_reason, attempt_time) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, username, ip, status, errorReason]
        );
    } catch (error) {
        console.error('로그인 시도 로깅 실패:', error);
    }
}

// 입력값 검증 함수
function validateLoginInput(username, password) {
    const errors = {};
    
    if (!username || username.trim() === '') {
        errors.username = '사용자명을 입력해주세요.';
    }
    
    if (!password || password.trim() === '') {
        errors.password = '비밀번호를 입력해주세요.';
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

// 로그인 시도 제한 미들웨어
const loginAttemptTracker = async (req, res, next) => {
    const { username } = req.body;
    
    if (!username) {
        return next();
    }
    
    const connection = await pool.getConnection();
    
    try {
        // 최근 30분 내 실패한 로그인 시도 횟수 조회
        const [attempts] = await connection.query(
            'SELECT COUNT(*) as failCount FROM login_attempts WHERE username = ? AND status = "FAILED" AND attempt_time > DATE_SUB(NOW(), INTERVAL 30 MINUTE)',
            [username]
        );
        
        const failCount = attempts[0].failCount;
        
        // 5회 이상 실패 시 비밀번호 재설정 메시지 표시
        if (failCount >= 4) {
            return res.status(403).json({
                code: 'TOO_MANY_ATTEMPTS',
                msg: '로그인 시도가 너무 많습니다. 비밀번호를 재설정해주세요.',
                resetRequired: true
            });
        }
        
        next();
    } catch (error) {
        console.error('로그인 시도 확인 중 오류:', error);
        next();
    } finally {
        connection.release();
    }
};

// GET 요청 처리 (로그인 페이지 렌더링)
router.get('/', csrfProtection, function(req, res) {
    // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
    if (req.session.userId) {
        return res.redirect('/');
    }
    
    // login.ejs를 렌더링하면서 CSRF 토큰 전달
    res.render('login', { 
        csrfToken: req.csrfToken(),
        registered: req.query.registered === 'true'
    });
});

router.post('/', csrfProtection, loginAttemptTracker, async(req, res) => {
    const LOG_HEADER_TITLE = "LOGIN";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    let ret_status = 200;
    let ret_data;
    let connection;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
        // 입력값 검증
        const { username, password } = req.body;
        const validation = validateLoginInput(username, password);
        
        if (!validation.isValid) {
            throw {
                code: 'INVALID_INPUT',
                message: '입력값이 유효하지 않습니다.',
                errors: validation.errors
            };
        }
        
        connection = await pool.getConnection();
        
        // 사용자 찾기
        const [users] = await connection.query(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        
        // 사용자 또는 비밀번호 오류 - 보안을 위해 구체적인 원인을 알려주지 않음
        if (users.length === 0 || !(await bcrypt.compare(password, users[0].password))) {
            await logLoginAttempt(
                connection, 
                username, 
                clientIP, 
                'FAILED',
                null, // user_id는 null
                users.length === 0 ? 'USER_NOT_FOUND' : 'INVALID_PASSWORD'
            );
            
            throw {
                code: 'AUTH_FAILED',
                message: '사용자명 또는 비밀번호가 올바르지 않습니다.',
                status: 403
            };
        }
        
        const user = users[0];
        
        // 로그인 성공 로깅
        await logLoginAttempt(connection, username, clientIP, 'SUCCESS', user.id);
        
        // 세션에 사용자 정보 저장
        req.session.userId = user.id;
        req.session.username = user.username;
        
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log("Session after login:", {
            userId: req.session.userId,
            username: req.session.username,
            sessionID: req.sessionID
        });
        
        ret_data = { 
            id: user.id, 
            username: user.username 
        };
        
    } catch (e) {
        // 오류 코드와 상태에 따른 처리
        const errorCode = e.code || 'SERVER_ERROR';
        const errorStatus = e.status || 500;
        const errorMessage = e.message || '로그인 처리 중 오류가 발생했습니다.';
        
        ret_status = errorStatus;
        console.error(LOG_ERR_HEADER + LOG_HEADER + `[${errorCode}] status(${ret_status}) ==> ${errorMessage}`);
        
        return res.status(ret_status).json({
            code: errorCode,
            msg: errorMessage,
            data: e.errors || null
        });
    } finally {
        if (connection) connection.release();
    }
    
    ret_data = {
        code: 'LOGIN_SUCCESS',
        msg: "SUCC: 로그인이 완료되었습니다.",
        data: ret_data
    };
    
    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
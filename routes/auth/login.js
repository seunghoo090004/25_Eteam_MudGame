// routes/auth/login.js - 레퍼런스 패턴 적용 (완전한 코드)

'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../../config/database');
const my_reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// 로그인 시도 로깅 함수
//========================================================================
async function logLoginAttempt(connection, email, ip, status, userId = null, errorReason = null) {
    const LOG_HEADER_TITLE = "LOG_LOGIN_ATTEMPT";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] IP[" + ip + "] --> " + LOG_HEADER_TITLE;
    
    try {
        await connection.query(
            'INSERT INTO login_attempts (user_id, email, ip_address, status, error_reason, attempt_time) VALUES (?, ?, ?, ?, ?, NOW())',
            [userId, email, ip, status, errorReason]
        );
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Status: " + status);
    } catch (error) {
        const error_data = {
            code: LOG_HEADER_TITLE + "(insert_error)",
            value: -1,
            value_ext1: 500,
            value_ext2: error.message,
            EXT_data: { email, ip, status, userId, errorReason }
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
    }
}

//========================================================================
// 입력값 검증 함수
//========================================================================
function validateLoginInput(email, password) {
    const LOG_HEADER_TITLE = "VALIDATE_LOGIN_INPUT";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] --> " + LOG_HEADER_TITLE;
    
    const errors = {};
    
    if (!email || email.trim() === '') {
        errors.email = '이메일을 입력해주세요.';
    }
    
    if (!password || password.trim() === '') {
        errors.password = '비밀번호를 입력해주세요.';
    }
    
    const isValid = Object.keys(errors).length === 0;
    
    if (isValid) {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Validation passed");
    } else {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Validation failed:", errors);
    }
    
    return { isValid, errors };
}

//========================================================================
// 로그인 시도 제한 미들웨어
//========================================================================
const loginAttemptTracker = async (req, res, next) => {
    const LOG_HEADER_TITLE = "LOGIN_ATTEMPT_TRACKER";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_input = -1;
    const catch_sqlconn = -2;
    const catch_sql_select = -3;
    
    let connection;
    
    try {
        const { email } = req.body;
        
        // 이메일 확인
        if (!email) {
            return next();
        }
        
        // DB 연결
        try {
            connection = await pool.getConnection();
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sqlconn);
            ret_data = {
                code: LOG_HEADER_TITLE + "(db_connection)",
                value: catch_sqlconn,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            return next();
        }
        
        // 최근 30분 내 실패한 로그인 시도 횟수 조회
        let attempts;
        try {
            [attempts] = await connection.query(
                'SELECT COUNT(*) as failCount FROM login_attempts WHERE email = ? AND status = "FAILED" AND attempt_time > DATE_SUB(NOW(), INTERVAL 30 MINUTE)',
                [email]
            );
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sql_select);
            ret_data = {
                code: LOG_HEADER_TITLE + "(sql_select)",
                value: catch_sql_select,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            return next();
        } finally {
            if (connection) connection.release();
        }
        
        const failCount = attempts[0].failCount;
        
        // 5회 이상 실패 시 비밀번호 재설정 메시지 표시
        if (failCount >= 4) {
            ret_data = {
                code: LOG_HEADER_TITLE + "(too_many_attempts)",
                value: failCount,
                value_ext1: 403,
                value_ext2: "Too many failed login attempts",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(403).json({
                code: 'TOO_MANY_ATTEMPTS',
                msg: '로그인 시도가 너무 많습니다. 비밀번호를 재설정해주세요.',
                resetRequired: true
            });
        }
        
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Attempt count: " + failCount);
        next();
        
    } catch (e) {
        if (connection) connection.release();
        const error_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -999,
            value_ext1: 500,
            value_ext2: e.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        next();
    }
};

//========================================================================
// GET 요청 처리 (로그인 페이지 렌더링)
//========================================================================
router.get('/', csrfProtection, function(req, res) {
    const LOG_HEADER_TITLE = "LOGIN_PAGE_GET";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "SessionUserId[" + my_reqinfo.maskId(req.session?.userId) + "] --> " + LOG_HEADER_TITLE;
    
    // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
    if (req.session.userId) {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Already logged in, redirecting to main");
        return res.redirect('/');
    }
    
    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Rendering login page");
    
    // login.ejs를 렌더링하면서 CSRF 토큰 전달
    res.render('login', { 
        csrfToken: req.csrfToken(),
        registered: req.query.registered === 'true'
    });
});

//========================================================================
router.post('/', csrfProtection, loginAttemptTracker, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "LOGIN_POST";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_sqlconn = -2;
    const catch_sql_select = -3;
    const catch_bcrypt = -4;
    const catch_session = -5;
    
    let connection;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    try {
        //----------------------------------------------------------------------
        // getBODY - 입력값 검증
        //----------------------------------------------------------------------
        let req_email, req_password;
        try {
            const { email, password } = req.body;
            const validation = validateLoginInput(email, password);
            
            if (!validation.isValid) {
                throw new Error("Input validation failed: " + JSON.stringify(validation.errors));
            }
            
            req_email = email;
            req_password = password;
        } catch (e) {
            ret_status = fail_status + (-1 * catch_body);
            ret_data = {
                code: LOG_HEADER_TITLE + "(input_validation)",
                value: catch_body,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(400).json({
                code: 'INVALID_INPUT',
                msg: '입력값이 유효하지 않습니다.',
                data: JSON.parse(e.message.replace('Input validation failed: ', ''))
            });
        }
        
        //----------------------------------------------------------------------
        // getConnection 
        //----------------------------------------------------------------------
        try {
            connection = await pool.getConnection();
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sqlconn);
            ret_data = {
                code: LOG_HEADER_TITLE + "(db_connection)",
                value: catch_sqlconn,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '로그인 처리 중 오류가 발생했습니다.',
                data: null
            });
        }

        //----------------------------------------------------------------------
        // SQL SELECT - 사용자 조회
        //----------------------------------------------------------------------
        let users;
        try {
            [users] = await connection.query(
                'SELECT * FROM users WHERE email = ?',
                [req_email]
            );
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sql_select);
            ret_data = {
                code: LOG_HEADER_TITLE + "(sql_select)",
                value: catch_sql_select,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            await logLoginAttempt(connection, req_email, clientIP, 'FAILED', null, 'SQL_ERROR');
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '로그인 처리 중 오류가 발생했습니다.',
                data: null
            });
        }

        //----------------------------------------------------------------------
        // 사용자 존재 여부 및 비밀번호 검증
        //----------------------------------------------------------------------
        if (users.length === 0) {
            await logLoginAttempt(connection, req_email, clientIP, 'FAILED', null, 'USER_NOT_FOUND');
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(user_not_found)",
                value: 0,
                value_ext1: 403,
                value_ext2: "User not found",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(403).json({
                code: 'AUTH_FAILED',
                msg: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }

        const user = users[0];

        // 비밀번호 검증
        let passwordValid;
        try {
            passwordValid = await bcrypt.compare(req_password, user.password);
        } catch (e) {
            ret_status = fail_status + (-1 * catch_bcrypt);
            ret_data = {
                code: LOG_HEADER_TITLE + "(bcrypt_compare)",
                value: catch_bcrypt,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            await logLoginAttempt(connection, req_email, clientIP, 'FAILED', user.user_id, 'BCRYPT_ERROR');
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '로그인 처리 중 오류가 발생했습니다.',
                data: null
            });
        }

        if (!passwordValid) {
            await logLoginAttempt(connection, req_email, clientIP, 'FAILED', user.user_id, 'INVALID_PASSWORD');
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(invalid_password)",
                value: 0,
                value_ext1: 403,
                value_ext2: "Invalid password",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(403).json({
                code: 'AUTH_FAILED',
                msg: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 이메일 인증 확인
        //----------------------------------------------------------------------
        if (!user.email_verified) {
            await logLoginAttempt(connection, req_email, clientIP, 'FAILED', user.user_id, 'EMAIL_NOT_VERIFIED');
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_not_verified)",
                value: 0,
                value_ext1: 403,
                value_ext2: "Email not verified",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(403).json({
                code: 'EMAIL_NOT_VERIFIED',
                msg: '이메일 인증이 필요합니다. 인증 메일을 확인해주세요.',
                email: user.email
            });
        }
        
        //----------------------------------------------------------------------
        // 로그인 성공 처리
        //----------------------------------------------------------------------
        
        // 로그인 성공 로깅
        await logLoginAttempt(connection, req_email, clientIP, 'SUCCESS', user.user_id);
        
        // 세션 설정
        try {
            req.session.userId = user.user_id;
            req.session.username = user.username;
            
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } catch (e) {
            ret_status = fail_status + (-1 * catch_session);
            ret_data = {
                code: LOG_HEADER_TITLE + "(session_save)",
                value: catch_session,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '로그인 처리 중 오류가 발생했습니다.',
                data: null
            });
        }
        
        //----------------------------------------------------------------------
        // result - 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                user_id: user.user_id,
                username: user.username,
                email: user.email
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                user_id: user.user_id,
                username: user.username,
                email: my_reqinfo.maskId(user.email)
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'LOGIN_SUCCESS',
            msg: '로그인이 완료되었습니다.',
            data: ret_data.value_ext2
        });
        
    } catch (e) {
        // 예상치 못한 오류 처리
        if (ret_status === 200) {
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        }
        
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '로그인 처리 중 오류가 발생했습니다.',
            data: null
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
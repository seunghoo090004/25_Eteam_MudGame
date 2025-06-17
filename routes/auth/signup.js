// routes/auth/signup.js - 레퍼런스 패턴 적용

'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../../config/database');
const my_reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');
const { generateToken, sendVerificationEmail } = require('../../utils/emailUtils');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// 입력값 검증 함수
//========================================================================
function validateSignupInput(username, email, password) {
    const LOG_HEADER_TITLE = "VALIDATE_SIGNUP_INPUT";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] Username[" + my_reqinfo.maskId(username) + "] --> " + LOG_HEADER_TITLE;
    
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
    
    const isValid = Object.keys(errors).length === 0;
    
    if (isValid) {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Validation passed");
    } else {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Validation failed:", errors);
    }
    
    return { isValid, errors };
}

//========================================================================
// GET /auth/signup - 회원가입 페이지 렌더링
//========================================================================
router.get('/', csrfProtection, function(req, res) {
    const LOG_HEADER_TITLE = "SIGNUP_PAGE_GET";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "SessionUserId[" + my_reqinfo.maskId(req.session?.userId) + "] --> " + LOG_HEADER_TITLE;
    
    // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
    if (req.session.userId) {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Already logged in, redirecting to main");
        return res.redirect('/');
    }
    
    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Rendering signup page");
    
    // signup.ejs를 렌더링하면서 CSRF 토큰 전달
    res.render('signup', { csrfToken: req.csrfToken() });
});

//========================================================================
router.post('/', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "SIGNUP_POST";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] Username[" + my_reqinfo.maskId(req.body.username) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_email_verification = -2;
    const catch_sqlconn = -3;
    const catch_sql_email_check = -4;
    const catch_sql_username_check = -5;
    const catch_bcrypt = -6;
    const catch_sql_insert = -7;
    
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // getBODY - 입력값 검증
        //----------------------------------------------------------------------
        let req_username, req_email, req_password, req_verified;
        try {
            const { username, email, password, verified } = req.body;
            const validation = validateSignupInput(username, email, password);
            
            if (!validation.isValid) {
                throw new Error("Input validation failed: " + JSON.stringify(validation.errors));
            }
            
            req_username = username;
            req_email = email;
            req_password = password;
            req_verified = verified;
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
            
            const errors = e.message.includes('Input validation failed:') 
                ? JSON.parse(e.message.replace('Input validation failed: ', ''))
                : null;
            
            return res.status(400).json({
                code: 'INVALID_INPUT',
                msg: '입력값이 유효하지 않습니다.',
                data: errors
            });
        }
        
        //----------------------------------------------------------------------
        // 이메일 인증 여부 확인
        //----------------------------------------------------------------------
        try {
            if (!req_verified) {
                throw new Error("Email verification required");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_email_verification);
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_verification)",
                value: catch_email_verification,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(403).json({
                code: 'EMAIL_NOT_VERIFIED',
                msg: '이메일 인증이 필요합니다.'
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
                msg: '회원가입 처리 중 오류가 발생했습니다.',
                data: null
            });
        }

        //----------------------------------------------------------------------
        // SQL SELECT - 이메일 중복 확인
        //----------------------------------------------------------------------
        let existingEmails;
        try {
            [existingEmails] = await connection.query(
                'SELECT * FROM users WHERE email = ?',
                [req_email]
            );
            
            if (existingEmails.length > 0) {
                throw new Error("Email already exists");
            }
        } catch (e) {
            if (e.message === "Email already exists") {
                ret_data = {
                    code: LOG_HEADER_TITLE + "(email_exists)",
                    value: existingEmails.length,
                    value_ext1: 409,
                    value_ext2: "Email already in use",
                    EXT_data
                };
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(409).json({
                    code: 'EMAIL_EXISTS',
                    msg: '이미 사용 중인 이메일입니다.'
                });
            } else {
                ret_status = fail_status + (-1 * catch_sql_email_check);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_email_check)",
                    value: catch_sql_email_check,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(500).json({
                    code: 'SERVER_ERROR',
                    msg: '회원가입 처리 중 오류가 발생했습니다.',
                    data: null
                });
            }
        }
        
        //----------------------------------------------------------------------
        // SQL SELECT - 사용자명 중복 확인
        //----------------------------------------------------------------------
        let existingUsers;
        try {
            [existingUsers] = await connection.query(
                'SELECT * FROM users WHERE username = ?',
                [req_username]
            );
            
            if (existingUsers.length > 0) {
                throw new Error("Username already exists");
            }
        } catch (e) {
            if (e.message === "Username already exists") {
                ret_data = {
                    code: LOG_HEADER_TITLE + "(username_exists)",
                    value: existingUsers.length,
                    value_ext1: 409,
                    value_ext2: "Username already in use",
                    EXT_data
                };
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(409).json({
                    code: 'USERNAME_EXISTS',
                    msg: '이미 사용 중인 닉네임입니다.'
                });
            } else {
                ret_status = fail_status + (-1 * catch_sql_username_check);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_username_check)",
                    value: catch_sql_username_check,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(500).json({
                    code: 'SERVER_ERROR',
                    msg: '회원가입 처리 중 오류가 발생했습니다.',
                    data: null
                });
            }
        }
        
        //----------------------------------------------------------------------
        // 비밀번호 해싱
        //----------------------------------------------------------------------
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(req_password, 12);
        } catch (e) {
            ret_status = fail_status + (-1 * catch_bcrypt);
            ret_data = {
                code: LOG_HEADER_TITLE + "(bcrypt_hash)",
                value: catch_bcrypt,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '회원가입 처리 중 오류가 발생했습니다.',
                data: null
            });
        }
        
        //----------------------------------------------------------------------
        // SQL INSERT - DB에 사용자 추가
        //----------------------------------------------------------------------
        let result;
        try {
            [result] = await connection.query(
                `INSERT INTO users 
                (email, username, password, email_verified, created_at) 
                VALUES (?, ?, ?, TRUE, NOW())`,
                [req_email, req_username, hashedPassword]
            );
            
            if (result.affectedRows < 1) {
                throw new Error("Insert failed - no rows affected");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sql_insert);
            ret_data = {
                code: LOG_HEADER_TITLE + "(sql_insert)",
                value: catch_sql_insert,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            // 중복 오류인지 확인
            if (e.code === 'ER_DUP_ENTRY') {
                if (e.message.includes('email')) {
                    return res.status(409).json({
                        code: 'EMAIL_EXISTS',
                        msg: '이미 사용 중인 이메일입니다.'
                    });
                } else if (e.message.includes('username')) {
                    return res.status(409).json({
                        code: 'USERNAME_EXISTS',
                        msg: '이미 사용 중인 닉네임입니다.'
                    });
                }
            }
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '회원가입 처리 중 오류가 발생했습니다.',
                data: null
            });
        }
        
        //----------------------------------------------------------------------
        // result - 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: result.affectedRows,
            value_ext1: ret_status,
            value_ext2: {
                email: req_email,
                username: req_username,
                id: result.insertId
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(req_email),
                username: req_username,
                id: result.insertId
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'SIGNUP_SUCCESS',
            msg: '회원가입이 완료되었습니다.',
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
        
        // 일반적인 오류 분류
        const errorCode = e.code || 'SERVER_ERROR';
        const errorStatus = e.status || 500;
        const errorMessage = e.message || '회원가입 처리 중 오류가 발생했습니다.';
        
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
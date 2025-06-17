// routes/auth/verify.js - 레퍼런스 패턴 적용

'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const my_reqinfo = require('../../utils/reqinfo');
const { sendVerificationEmail, generateToken } = require('../../utils/emailUtils');
const csrf = require('csurf');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// 인증 코드 생성 함수
//========================================================================
function generateVerificationCode() {
    const LOG_HEADER_TITLE = "GENERATE_VERIFICATION_CODE";
    const LOG_HEADER = "CodeGenerator --> " + LOG_HEADER_TITLE;
    
    try {
        const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6자리 코드
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Code generated successfully");
        return code;
    } catch (e) {
        const error_data = {
            code: LOG_HEADER_TITLE + "(generation_error)",
            value: -1,
            value_ext1: 500,
            value_ext2: e.message,
            EXT_data: {}
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        throw e;
    }
}

// 인증 코드 저장 및 관리를 위한 객체
const verificationCodes = {};

//========================================================================
router.post('/send-code', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "SEND_VERIFICATION_CODE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_sqlconn = -2;
    const catch_sql_select = -3;
    const catch_code_generation = -4;
    const catch_email_send = -5;
    
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // getBODY - 입력값 검증
        //----------------------------------------------------------------------
        let req_email;
        try {
            const { email } = req.body;
            
            if (!email) {
                throw new Error("Email is required");
            }
            
            // 이메일 형식 검증
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(email)) {
                throw new Error("Invalid email format");
            }
            
            req_email = email;
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
                msg: '이메일을 입력해주세요.'
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
                msg: '인증 코드 발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL SELECT - 이미 가입된 이메일인지 확인
        //----------------------------------------------------------------------
        let existingUsers;
        try {
            [existingUsers] = await connection.query(
                'SELECT * FROM users WHERE email = ?',
                [req_email]
            );
            
            if (existingUsers.length > 0) {
                throw new Error("Email already exists");
            }
        } catch (e) {
            if (e.message === "Email already exists") {
                ret_data = {
                    code: LOG_HEADER_TITLE + "(email_exists)",
                    value: existingUsers.length,
                    value_ext1: 409,
                    value_ext2: "Email already registered",
                    EXT_data
                };
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(409).json({
                    code: 'EMAIL_EXISTS',
                    msg: '이미 가입된 이메일입니다.'
                });
            } else {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(500).json({
                    code: 'SERVER_ERROR',
                    msg: '인증 코드 발송 중 오류가 발생했습니다.'
                });
            }
        }
        
        //----------------------------------------------------------------------
        // 인증 코드 생성
        //----------------------------------------------------------------------
        let verificationCode;
        try {
            verificationCode = generateVerificationCode();
            
            // 인증 코드 저장 (실제 환경에서는 DB에 저장하는 것이 좋음)
            verificationCodes[req_email] = {
                code: verificationCode,
                expires: new Date(Date.now() + 30 * 60 * 1000) // 30분 후 만료
            };
        } catch (e) {
            ret_status = fail_status + (-1 * catch_code_generation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(code_generation)",
                value: catch_code_generation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '인증 코드 발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 이메일 발송
        //----------------------------------------------------------------------
        try {
            await sendVerificationEmail(
                req_email,
                `머드게임 이메일 인증 코드: ${verificationCode}`,
                `<h1>머드게임 이메일 인증</h1>
                <p>안녕하세요! 머드게임 회원가입을 위한 인증 코드입니다.</p>
                <p>인증 코드: <strong>${verificationCode}</strong></p>
                <p>이 코드는 30분 동안 유효합니다.</p>`
            );
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
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '인증 코드 발송 중 오류가 발생했습니다.'
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
                email: req_email,
                codeSent: true,
                expiresIn: 30
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(req_email),
                codeSent: true,
                expiresIn: 30
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'CODE_SENT',
            msg: '인증 코드가 발송되었습니다. 이메일을 확인해주세요.'
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
            msg: '인증 코드 발송 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

//========================================================================
router.post('/check-code', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "CHECK_VERIFICATION_CODE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] Code[" + my_reqinfo.maskId(req.body.code) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_code_not_found = -2;
    const catch_code_expired = -3;
    const catch_code_invalid = -4;
    
    try {
        //----------------------------------------------------------------------
        // getBODY - 입력값 검증
        //----------------------------------------------------------------------
        let req_email, req_code;
        try {
            const { email, code } = req.body;
            
            if (!email || !code) {
                throw new Error("Email and code are required");
            }
            
            req_email = email;
            req_code = code;
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
                msg: '이메일과 인증 코드를 입력해주세요.'
            });
        }
        
        //----------------------------------------------------------------------
        // 저장된 인증 코드 확인
        //----------------------------------------------------------------------
        const storedData = verificationCodes[req_email];
        
        if (!storedData) {
            ret_status = fail_status + (-1 * catch_code_not_found);
            ret_data = {
                code: LOG_HEADER_TITLE + "(code_not_found)",
                value: catch_code_not_found,
                value_ext1: ret_status,
                value_ext2: "No verification code found for email",
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(404).json({
                code: 'CODE_NOT_FOUND',
                msg: '인증 코드가 발급되지 않았습니다. 다시 요청해주세요.'
            });
        }
        
        if (new Date() > storedData.expires) {
            delete verificationCodes[req_email]; // 만료된 코드 삭제
            
            ret_status = fail_status + (-1 * catch_code_expired);
            ret_data = {
                code: LOG_HEADER_TITLE + "(code_expired)",
                value: catch_code_expired,
                value_ext1: ret_status,
                value_ext2: "Verification code expired",
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(401).json({
                code: 'CODE_EXPIRED',
                msg: '인증 코드가 만료되었습니다. 다시 요청해주세요.'
            });
        }
        
        if (storedData.code !== req_code) {
            ret_status = fail_status + (-1 * catch_code_invalid);
            ret_data = {
                code: LOG_HEADER_TITLE + "(code_invalid)",
                value: catch_code_invalid,
                value_ext1: ret_status,
                value_ext2: "Invalid verification code",
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(401).json({
                code: 'INVALID_CODE',
                msg: '인증 코드가 일치하지 않습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 인증 성공 처리
        //----------------------------------------------------------------------
        verificationCodes[req_email].verified = true;
        
        //----------------------------------------------------------------------
        // result - 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                email: req_email,
                verified: true
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(req_email),
                verified: true
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'VERIFICATION_SUCCESS',
            msg: '이메일 인증이 완료되었습니다.'
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
            msg: '인증 코드 확인 중 오류가 발생했습니다.'
        });
    }
});

//========================================================================
// GET /auth/verify - 이메일 인증 링크 처리 (기존 코드)
//========================================================================
router.get('/', async(req, res) => {
    const LOG_HEADER_TITLE = "EMAIL_VERIFY";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Token[" + my_reqinfo.maskId(req.query.token) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_token = -1;
    const catch_sqlconn = -2;
    const catch_sql_select = -3;
    const catch_sql_update = -4;
    
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // 토큰 확인
        //----------------------------------------------------------------------
        const { token } = req.query;
        
        if (!token) {
            ret_data = {
                code: LOG_HEADER_TITLE + "(token_missing)",
                value: catch_token,
                value_ext1: 400,
                value_ext2: "Token is required",
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.render('verify', { 
                success: false, 
                message: '유효하지 않은 인증 토큰입니다.' 
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
            
            return res.render('verify', { 
                success: false, 
                message: '인증 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' 
            });
        }
        
        //----------------------------------------------------------------------
        // SQL SELECT - 토큰으로 사용자 찾기
        //----------------------------------------------------------------------
        let users;
        try {
            [users] = await connection.query(
                'SELECT * FROM users WHERE verification_token = ? AND verification_expires > NOW() AND email_verified = FALSE',
                [token]
            );
            
            if (users.length === 0) {
                throw new Error("Invalid or expired token");
            }
        } catch (e) {
            if (e.message === "Invalid or expired token") {
                ret_data = {
                    code: LOG_HEADER_TITLE + "(invalid_token)",
                    value: 0,
                    value_ext1: 400,
                    value_ext2: "Token validation failed",
                    EXT_data
                };
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.render('verify', { 
                    success: false, 
                    message: '유효하지 않거나 만료된 토큰입니다. 회원가입을 다시 시도하거나 새 인증 링크를 요청하세요.' 
                });
            } else {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.render('verify', { 
                    success: false, 
                    message: '인증 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' 
                });
            }
        }
        
        //----------------------------------------------------------------------
        // SQL UPDATE - 이메일 인증 완료 처리
        //----------------------------------------------------------------------
        try {
            const [updateResult] = await connection.query(
                'UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE user_id = ?',
                [users[0].user_id]
            );
            
            if (updateResult.affectedRows === 0) {
                throw new Error("Email verification update failed");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sql_update);
            ret_data = {
                code: LOG_HEADER_TITLE + "(sql_update)",
                value: catch_sql_update,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.render('verify', { 
                success: false, 
                message: '인증 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' 
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
                email: users[0].email,
                userId: users[0].user_id,
                verified: true
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(users[0].email),
                userId: users[0].user_id,
                verified: true
            }
        }, null, 2));
        
        return res.render('verify', { 
            success: true, 
            message: '이메일 인증이 완료되었습니다. 이제 로그인할 수 있습니다.',
            redirectUrl: '/auth/login'
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
        
        return res.render('verify', { 
            success: false, 
            message: '인증 처리 중 오류가 발생했습니다. 나중에 다시 시도해주세요.' 
        });
    } finally {
        if (connection) connection.release();
    }
});

//========================================================================
router.post('/resend', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "EMAIL_VERIFY_RESEND";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_sqlconn = -2;
    const catch_sql_select = -3;
    const catch_token_generation = -4;
    const catch_sql_update = -5;
    const catch_email_send = -6;
    
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // getBODY - 입력값 검증
        //----------------------------------------------------------------------
        let req_email;
        try {
            const { email } = req.body;
            
            if (!email) {
                throw new Error("Email is required");
            }
            
            req_email = email;
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
                msg: '이메일을 입력해주세요.'
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
                msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL SELECT - 이메일로 사용자 찾기
        //----------------------------------------------------------------------
        let users;
        try {
            [users] = await connection.query(
                'SELECT * FROM users WHERE email = ? AND email_verified = FALSE',
                [req_email]
            );
            
            if (users.length === 0) {
                throw new Error("User not found or already verified");
            }
        } catch (e) {
            if (e.message === "User not found or already verified") {
                ret_data = {
                    code: LOG_HEADER_TITLE + "(user_not_found)",
                    value: 0,
                    value_ext1: 404,
                    value_ext2: "No unverified user found for email",
                    EXT_data
                };
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(404).json({
                    code: 'USER_NOT_FOUND',
                    msg: '해당 이메일로 등록된 미인증 계정을 찾을 수 없습니다.'
                });
            } else {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                return res.status(500).json({
                    code: 'SERVER_ERROR',
                    msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
                });
            }
        }
        
        //----------------------------------------------------------------------
        // 새 인증 토큰 생성
        //----------------------------------------------------------------------
        let verificationToken;
        try {
            verificationToken = generateToken();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24); // 24시간 후 만료
        } catch (e) {
            ret_status = fail_status + (-1 * catch_token_generation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(token_generation)",
                value: catch_token_generation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL UPDATE - 토큰 업데이트
        //----------------------------------------------------------------------
        try {
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);
            
            const [updateResult] = await connection.query(
                'UPDATE users SET verification_token = ?, verification_expires = ? WHERE user_id = ?',
                [verificationToken, expiresAt, users[0].user_id]
            );
            
            if (updateResult.affectedRows === 0) {
                throw new Error("Token update failed");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sql_update);
            ret_data = {
                code: LOG_HEADER_TITLE + "(sql_update)",
                value: catch_sql_update,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 인증 이메일 재발송
        //----------------------------------------------------------------------
        try {
            await sendVerificationEmail(req_email, verificationToken);
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
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
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
                email: req_email,
                tokenResent: true
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(req_email),
                tokenResent: true
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'VERIFICATION_RESENT',
            msg: '인증 이메일이 재발송되었습니다. 이메일을 확인해주세요.'
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
            msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
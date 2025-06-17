// routes/auth/reset-password.js - 레퍼런스 패턴 적용

'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../../config/database');
const my_reqinfo = require('../../utils/reqinfo');
const bcrypt = require('bcrypt');
const csrf = require('csurf');
const { generateToken, sendPasswordResetEmail } = require('../../utils/emailUtils');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// GET /auth/reset-password - 비밀번호 재설정 페이지
//========================================================================
router.get('/', csrfProtection, function(req, res) {
    const LOG_HEADER_TITLE = "RESET_PASSWORD_PAGE_GET";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Token[" + my_reqinfo.maskId(req.query.token) + "] --> " + LOG_HEADER_TITLE;
    
    const { token } = req.query;
    
    if (token) {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Rendering password change page");
        return res.render('reset-password-change', { 
            csrfToken: req.csrfToken(),
            token
        });
    }
    
    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Rendering password request page");
    res.render('reset-password-request', { 
        csrfToken: req.csrfToken() 
    });
});

//========================================================================
router.post('/request', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "RESET_PASSWORD_REQUEST";
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
                msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL SELECT - 이메일로 사용자 찾기
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
            
            return res.status(500).json({
                code: 'SERVER_ERROR',
                msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
            });
        }
        
        // 사용자가 존재하지 않아도 성공 응답 (보안상 이유)
        if (users.length === 0) {
            ret_data = {
                code: LOG_HEADER_TITLE + "(user_not_found)",
                value: 0,
                value_ext1: ret_status,
                value_ext2: "User not found but returning success for security",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(200).json({
                code: 'RESET_EMAIL_SENT',
                msg: '비밀번호 재설정 이메일이 발송되었습니다. 이메일을 확인해주세요.'
            });
        }
        
        const user = users[0];
        
        //----------------------------------------------------------------------
        // 재설정 토큰 생성
        //----------------------------------------------------------------------
        let resetToken;
        try {
            resetToken = generateToken();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 후 만료
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
                msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL UPDATE - DB에 토큰 저장
        //----------------------------------------------------------------------
        try {
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1);
            
            const [updateResult] = await connection.query(
                'UPDATE users SET reset_token = ?, reset_expires = ? WHERE user_id = ?',
                [resetToken, expiresAt, user.user_id]
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
                msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 비밀번호 재설정 이메일 발송
        //----------------------------------------------------------------------
        try {
            await sendPasswordResetEmail(req_email, resetToken);
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
                msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
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
                tokenSent: true
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(req_email),
                tokenSent: true
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'RESET_EMAIL_SENT',
            msg: '비밀번호 재설정 이메일이 발송되었습니다. 이메일을 확인해주세요.'
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
            msg: '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

//========================================================================
router.post('/change', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "RESET_PASSWORD_CHANGE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Token[" + my_reqinfo.maskId(req.body.token) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_password_validation = -2;
    const catch_sqlconn = -3;
    const catch_sql_select = -4;
    const catch_bcrypt = -5;
    const catch_sql_update = -6;
    const catch_sql_cleanup = -7;
    
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // getBODY - 입력값 검증
        //----------------------------------------------------------------------
        let req_token, req_password, req_passwordConfirm;
        try {
            const { token, password, passwordConfirm } = req.body;
            
            if (!token || !password || !passwordConfirm) {
                throw new Error("All fields are required");
            }
            
            if (password !== passwordConfirm) {
                throw new Error("Passwords do not match");
            }
            
            req_token = token;
            req_password = password;
            req_passwordConfirm = passwordConfirm;
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
            
            let errorMsg = '모든 필드를 입력해주세요.';
            if (e.message === "Passwords do not match") {
                errorMsg = '비밀번호가 일치하지 않습니다.';
            }
            
            return res.status(400).json({
                code: 'INVALID_INPUT',
                msg: errorMsg
            });
        }
        
        //----------------------------------------------------------------------
        // 비밀번호 유효성 검사
        //----------------------------------------------------------------------
        try {
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
            if (!passwordRegex.test(req_password)) {
                throw new Error("Password does not meet requirements");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_password_validation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(password_validation)",
                value: catch_password_validation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(400).json({
                code: 'INVALID_PASSWORD',
                msg: '비밀번호는 최소 8자 이상이며, 대문자, 소문자, 숫자를 포함해야 합니다.'
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
                msg: '비밀번호 재설정 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL SELECT - 토큰으로 사용자 찾기
        //----------------------------------------------------------------------
        let users;
        try {
            [users] = await connection.query(
                'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()',
                [req_token]
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
                
                return res.status(400).json({
                    code: 'INVALID_TOKEN',
                    msg: '유효하지 않거나 만료된 토큰입니다. 비밀번호 재설정을 다시 요청해주세요.'
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
                    msg: '비밀번호 재설정 중 오류가 발생했습니다.'
                });
            }
        }
        
        const user = users[0];
        
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
                msg: '비밀번호 재설정 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // SQL UPDATE - 비밀번호 업데이트 및 토큰 제거
        //----------------------------------------------------------------------
        try {
            const [updateResult] = await connection.query(
                'UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE user_id = ?',
                [hashedPassword, user.user_id]
            );
            
            if (updateResult.affectedRows === 0) {
                throw new Error("Password update failed");
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
                msg: '비밀번호 재설정 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 로그인 실패 기록 삭제
        //----------------------------------------------------------------------
        try {
            await connection.query(
                'DELETE FROM login_attempts WHERE email = ? AND status = "FAILED"',
                [user.email]
            );
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sql_cleanup);
            ret_data = {
                code: LOG_HEADER_TITLE + "(sql_cleanup)",
                value: catch_sql_cleanup,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            // 정리 실패는 경고로만 처리하고 계속 진행
        }
        
        //----------------------------------------------------------------------
        // result - 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                email: user.email,
                passwordChanged: true,
                userId: user.user_id
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                email: my_reqinfo.maskId(user.email),
                passwordChanged: true,
                userId: user.user_id
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'PASSWORD_RESET_SUCCESS',
            msg: '비밀번호가 성공적으로 재설정되었습니다. 새 비밀번호로 로그인해주세요.'
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
            msg: '비밀번호 재설정 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;
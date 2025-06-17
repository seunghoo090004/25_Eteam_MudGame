// routes/auth/reset-password.js - 프로시저 기반 리팩토링 (레퍼런스 패턴 적용)

'use strict';
const express = require('express');
const router = express.Router();
const { callBusinessProcedure, generateUUID } = require('../../config/database');
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
// POST /auth/reset-password/request - 비밀번호 재설정 요청
//========================================================================
router.post('/request', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "RESET_PASSWORD_REQUEST";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_token_generation = -2;
    const catch_procedure_call = -3;
    const catch_email_send = -4;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 입력값 검증
        //----------------------------------------------------------------------
        let inputData;
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
            
            inputData = {
                email: email.toLowerCase().trim()
            };
            
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
            
            return res.status(400).json({
                code: 'INVALID_INPUT',
                msg: '유효한 이메일 주소를 입력해주세요.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 토큰 생성 및 프로시저 호출
        //----------------------------------------------------------------------
        let resetToken, expiresAt, procedureResult;
        try {
            // 1. 재설정 토큰 생성
            resetToken = generateToken();
            expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 후 만료
            
            if (!resetToken || resetToken.length < 10) {
                throw new Error("Token generation failed");
            }
            
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
        
        try {
            // 2. 비밀번호 재설정 프로시저 호출
            procedureResult = await callBusinessProcedure(
                'pcg_password_reset_request',
                [inputData.email, resetToken, expiresAt],
                ['p_userid', 'p_username']
            );
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_procedure_call);
            ret_data = {
                code: LOG_HEADER_TITLE + "(procedure_call)",
                value: catch_procedure_call,
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
        // 출력층: 결과 처리 및 이메일 발송
        //----------------------------------------------------------------------
        
        // 사용자가 존재하지 않아도 성공 응답 (보안상 이유)
        if (!procedureResult.success || procedureResult.code === -100) {
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
        
        // 사용자 정보 추출
        const userInfo = {
            userid: procedureResult.data.p_userid,
            username: procedureResult.data.p_username,
            email: inputData.email
        };
        
        //----------------------------------------------------------------------
        // 이메일 발송
        //----------------------------------------------------------------------
        try {
            const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password?token=${resetToken}`;
            const emailSubject = '머드게임 비밀번호 재설정';
            const emailBody = `
                <h1>비밀번호 재설정</h1>
                <p>안녕하세요, ${userInfo.username}님!</p>
                <p>비밀번호 재설정을 요청하셨습니다.</p>
                <p>아래 링크를 클릭하여 새로운 비밀번호를 설정해주세요:</p>
                <p><a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">비밀번호 재설정</a></p>
                <p>이 링크는 1시간 후 만료됩니다.</p>
                <p>만약 비밀번호 재설정을 요청하지 않으셨다면, 이 이메일을 무시해주세요.</p>
                <br>
                <p>머드게임 팀</p>
            `;
            
            await sendPasswordResetEmail(inputData.email, emailSubject, emailBody);
            
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
        // 최종 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: "Password reset email sent successfully",
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        
        return res.status(200).json({
            code: 'RESET_EMAIL_SENT',
            msg: '비밀번호 재설정 이메일이 발송되었습니다. 이메일을 확인해주세요.'
        });
        
    } catch (error) {
        // 예상치 못한 에러 처리
        ret_status = fail_status;
        ret_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -99,
            value_ext1: ret_status,
            value_ext2: error.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        });
    }
});

//========================================================================
// POST /auth/reset-password/change - 비밀번호 변경
//========================================================================
router.post('/change', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "RESET_PASSWORD_CHANGE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Token[" + my_reqinfo.maskId(req.body.token) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_password_validation = -2;
    const catch_token_verification = -3;
    const catch_bcrypt = -4;
    const catch_password_complete = -5;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 입력값 검증
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { token, password, passwordConfirm } = req.body;
            
            if (!token || !password || !passwordConfirm) {
                throw new Error("All fields are required");
            }
            
            if (password !== passwordConfirm) {
                throw new Error("Passwords do not match");
            }
            
            if (token.length < 10) {
                throw new Error("Invalid token format");
            }
            
            inputData = {
                token: token.trim(),
                password: password,
                passwordConfirm: passwordConfirm
            };
            
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
            
            let errorMsg = '모든 필드를 입력해주세요.';
            if (e.message === "Passwords do not match") {
                errorMsg = '비밀번호가 일치하지 않습니다.';
            } else if (e.message === "Invalid token format") {
                errorMsg = '잘못된 토큰입니다.';
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
            if (!passwordRegex.test(inputData.password)) {
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
                msg: '비밀번호는 대소문자, 숫자를 포함하여 8자 이상이어야 합니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 토큰 검증
        //----------------------------------------------------------------------
        let verificationResult;
        try {
            verificationResult = await callBusinessProcedure(
                'pcg_password_reset_verify',
                [inputData.token],
                ['p_userid', 'p_username', 'p_email']
            );
            
            if (!verificationResult.success) {
                throw new Error(verificationResult.message || "Token verification failed");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_token_verification);
            ret_data = {
                code: LOG_HEADER_TITLE + "(token_verification)",
                value: catch_token_verification,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            let errorMsg = '잘못되었거나 만료된 토큰입니다.';
            if (verificationResult && verificationResult.code === -100) {
                errorMsg = '잘못되었거나 만료된 토큰입니다.';
            }
            
            return res.status(400).json({
                code: 'INVALID_TOKEN',
                msg: errorMsg
            });
        }
        
        // 토큰 검증 성공 - 사용자 정보 추출
        const userInfo = {
            userid: verificationResult.data.p_userid,
            username: verificationResult.data.p_username,
            email: verificationResult.data.p_email
        };
        
        //----------------------------------------------------------------------
        // 비밀번호 해싱
        //----------------------------------------------------------------------
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(inputData.password, 12);
        } catch (e) {
            ret_status = fail_status + (-1 * catch_bcrypt);
            ret_data = {
                code: LOG_HEADER_TITLE + "(bcrypt)",
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
        // 비밀번호 재설정 완료
        //----------------------------------------------------------------------
        let completionResult;
        try {
            completionResult = await callBusinessProcedure(
                'pcg_password_reset_complete',
                [inputData.token, hashedPassword],
                ['p_userid']
            );
            
            if (!completionResult.success) {
                throw new Error(completionResult.message || "Password reset completion failed");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_password_complete);
            ret_data = {
                code: LOG_HEADER_TITLE + "(password_complete)",
                value: catch_password_complete,
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
        // 출력층: 최종 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: "Password reset completed successfully",
            EXT_data: {
                ...EXT_data,
                userid: userInfo.userid,
                username: userInfo.username
            }
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            EXT_data: { ...ret_data.EXT_data, username: "***" }
        }, null, 2));
        
        return res.status(200).json({
            code: 'PASSWORD_RESET_SUCCESS',
            msg: '비밀번호가 성공적으로 변경되었습니다. 새로운 비밀번호로 로그인해주세요.'
        });
        
    } catch (error) {
        // 예상치 못한 에러 처리
        ret_status = fail_status;
        ret_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -99,
            value_ext1: ret_status,
            value_ext2: error.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        
        return res.status(500).json({
            code: 'SERVER_ERROR',
            msg: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        });
    }
});

module.exports = router;
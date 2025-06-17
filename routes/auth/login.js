// routes/auth/login.js - 프로시저 기반 리팩토링 (레퍼런스 패턴 적용)

'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const my_reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');
const { 
    callBusinessProcedure,
    generateAttemptId,
    validateEmail,
    normalizeEmail,
    logLoginAttempt
} = require('../../utils/dbUtils');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// 입력값 검증 함수 (입력층)
//========================================================================
function validateLoginInput(email, password) {
    const LOG_HEADER_TITLE = "VALIDATE_LOGIN_INPUT";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] --> " + LOG_HEADER_TITLE;
    
    const errors = {};
    
    if (!email || email.trim() === '') {
        errors.email = '이메일을 입력해주세요.';
    } else if (!validateEmail(email)) {
        errors.email = '유효한 이메일 형식이 아닙니다.';
    }
    
    if (!password || password.trim() === '') {
        errors.password = '비밀번호를 입력해주세요.';
    } else if (password.length < 4) {
        errors.password = '비밀번호는 4자 이상 입력해주세요.';
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
// GET /auth/login - 로그인 페이지 렌더링
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
        csrfToken: req.csrfToken() 
    });
});

//========================================================================
// POST /auth/login - 로그인 처리
//========================================================================
router.post('/', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "LOGIN_PROCESS";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_user_lookup = -2;
    const catch_password_verification = -3;
    const catch_email_verification = -4;
    const catch_session_creation = -5;
    
    // 클라이언트 IP 추출
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
        || req.headers['x-real-ip'] 
        || req.connection.remoteAddress 
        || req.socket.remoteAddress 
        || (req.connection.socket ? req.connection.socket.remoteAddress : null)
        || req.ip 
        || 'unknown';
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 요청 데이터 검증 및 추출
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { email, password } = req.body;
            const validation = validateLoginInput(email, password);
            
            if (!validation.isValid) {
                throw new Error("Input validation failed: " + JSON.stringify(validation.errors));
            }
            
            inputData = {
                email: normalizeEmail(email),
                password: password
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
        // 처리층: 사용자 인증 및 조회
        //----------------------------------------------------------------------
        let userInfo;
        try {
            // pcg_login_authenticate 프로시저 호출
            const authResult = await callBusinessProcedure('pcg_login_authenticate', 
                [inputData.email], 
                ['p_userid', 'p_username', 'p_passwd', 'p_email_verified']
            );
            
            if (!authResult.success) {
                if (authResult.code === -100) {
                    // 사용자를 찾을 수 없음
                    await logLoginAttempt(null, clientIP, 'FAILED', 'USER_NOT_FOUND');
                    throw new Error("AUTH_FAILED");
                }
                throw new Error(authResult.message || "Authentication failed");
            }
            
            userInfo = {
                userid: authResult.data.p_userid,
                username: authResult.data.p_username,
                passwd: authResult.data.p_passwd,
                email_verified: authResult.data.p_email_verified,
                email: inputData.email
            };
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_user_lookup);
            ret_data = {
                code: LOG_HEADER_TITLE + "(user_lookup)",
                value: catch_user_lookup,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            if (e.message === "AUTH_FAILED") {
                return res.status(401).json({
                    code: 'INVALID_CREDENTIALS',
                    msg: '이메일 또는 비밀번호가 올바르지 않습니다.'
                });
            }
            
            return res.status(500).json({
                code: 'AUTH_ERROR',
                msg: '인증 처리 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 비밀번호 검증
        //----------------------------------------------------------------------
        try {
            const passwordValid = await bcrypt.compare(inputData.password, userInfo.passwd);
            
            if (!passwordValid) {
                await logLoginAttempt(userInfo.userid, clientIP, 'FAILED', 'INVALID_PASSWORD');
                throw new Error("INVALID_PASSWORD");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_password_verification);
            ret_data = {
                code: LOG_HEADER_TITLE + "(password_verification)",
                value: catch_password_verification,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            if (e.message === "INVALID_PASSWORD") {
                return res.status(401).json({
                    code: 'INVALID_CREDENTIALS',
                    msg: '이메일 또는 비밀번호가 올바르지 않습니다.'
                });
            }
            
            return res.status(500).json({
                code: 'PASSWORD_ERROR',
                msg: '비밀번호 검증 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 이메일 인증 확인
        //----------------------------------------------------------------------
        try {
            if (!userInfo.email_verified) {
                await logLoginAttempt(userInfo.userid, clientIP, 'FAILED', 'EMAIL_NOT_VERIFIED');
                throw new Error("EMAIL_NOT_VERIFIED");
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
            
            if (e.message === "EMAIL_NOT_VERIFIED") {
                return res.status(403).json({
                    code: 'EMAIL_NOT_VERIFIED',
                    msg: '이메일 인증이 필요합니다. 가입 시 받은 인증 이메일을 확인해주세요.'
                });
            }
            
            return res.status(500).json({
                code: 'VERIFICATION_ERROR',
                msg: '이메일 인증 확인 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 세션 생성 및 로그인 성공 처리 (수정된 버전)
        //----------------------------------------------------------------------
        try {
            // 로그인 성공 로깅
            await logLoginAttempt(userInfo.userid, clientIP, 'SUCCESS', null);
            
            // **🔧 userInfo.userid 타입 검증 추가**
            if (!userInfo.userid || typeof userInfo.userid !== 'string') {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid userInfo.userid:", {
                    userid: userInfo.userid,
                    type: typeof userInfo.userid,
                    fullUserInfo: userInfo
                });
                throw new Error("Invalid user ID from database");
            }
            
            // **🔧 세션에 사용자 정보 저장 (타입 확인)**
            req.session.userId = String(userInfo.userid);  // 명시적 문자열 변환
            req.session.username = String(userInfo.username || '');
            req.session.email = String(userInfo.email || '');
            req.session.loginTime = new Date();
            
            // **🔧 세션 저장 후 검증**
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        // 저장된 세션 데이터 검증
                        if (typeof req.session.userId !== 'string') {
                            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Session userId type mismatch after save:", {
                                storedUserId: req.session.userId,
                                type: typeof req.session.userId
                            });
                            reject(new Error("Session data corruption detected"));
                        } else {
                            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Session saved successfully:", {
                                userId: my_reqinfo.maskId(req.session.userId),
                                userIdType: typeof req.session.userId,
                                userIdLength: req.session.userId.length
                            });
                            resolve();
                        }
                    }
                });
            });
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_session_creation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(session_creation)",
                value: catch_session_creation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'SESSION_ERROR',
                msg: '세션 생성 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 출력층: 최종 성공 응답
        //----------------------------------------------------------------------
        const loginResult = {
            userId: userInfo.userid,
            username: userInfo.username,
            email: userInfo.email,
            loginTime: req.session.loginTime
        };
        
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: loginResult,
            EXT_data: {
                ...EXT_data,
                userId: my_reqinfo.maskId(userInfo.userid),
                username: my_reqinfo.maskId(userInfo.username)
            }
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: { 
                userId: my_reqinfo.maskId(userInfo.userid), 
                username: "***", 
                email: my_reqinfo.maskId(userInfo.email),
                loginTime: "***"
            }
        }, null, 2));
        
        return res.status(200).json({
            code: 'LOGIN_SUCCESS',
            msg: '로그인이 완료되었습니다.',
            data: {
                username: userInfo.username,
                email: userInfo.email
            }
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
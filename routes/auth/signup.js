// routes/auth/signup.js - 프로시저 기반 리팩토링 (레퍼런스 패턴 적용)

'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const my_reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');
const { 
    callBusinessProcedure,
    generateUserId,
    generateLoginId,
    validateEmail,
    validateUsername,
    validatePassword,
    normalizeEmail,
    normalizeUsername,
    checkEmailExists,
    checkUsernameExists,
    getValidationErrorMessage
} = require('../../utils/dbUtils');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// 입력값 검증 함수 (입력층)
//========================================================================
function validateSignupInput(username, email, password) {
    const LOG_HEADER_TITLE = "VALIDATE_SIGNUP_INPUT";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] Username[" + my_reqinfo.maskId(username) + "] --> " + LOG_HEADER_TITLE;
    
    const errors = {};
    
    if (!validateUsername(username)) {
        errors.username = getValidationErrorMessage('username');
    }
    
    if (!validateEmail(email)) {
        errors.email = getValidationErrorMessage('email');
    }
    
    if (!validatePassword(password)) {
        errors.password = getValidationErrorMessage('password');
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
    res.render('signup', { 
        csrfToken: req.csrfToken() 
    });
});

//========================================================================
// POST /auth/signup - 회원가입 처리
//========================================================================
router.post('/', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "SIGNUP_PROCESS";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] Username[" + my_reqinfo.maskId(req.body.username) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_duplicate_check = -2;
    const catch_password_hashing = -3;
    const catch_user_creation = -4;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 요청 데이터 검증 및 추출
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { username, email, password, verified } = req.body;
            
            // 기본 입력값 검증
            const validation = validateSignupInput(username, email, password);
            if (!validation.isValid) {
                throw new Error("Input validation failed: " + JSON.stringify(validation.errors));
            }
            
            // 이메일 인증 확인 (프론트엔드에서 verified=true로 전송)
            if (!verified) {
                throw new Error("Email verification required");
            }
            
            inputData = {
                username: normalizeUsername(username),
                email: normalizeEmail(email),
                password: password,
                verified: verified
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
            
            let errorMsg = '입력값이 유효하지 않습니다.';
            let errors = null;
            
            if (e.message.includes('Input validation failed:')) {
                errors = JSON.parse(e.message.replace('Input validation failed: ', ''));
                errorMsg = '입력값 검증에 실패했습니다.';
            } else if (e.message === "Email verification required") {
                errorMsg = '이메일 인증이 필요합니다.';
            }
            
            return res.status(400).json({
                code: 'INVALID_INPUT',
                msg: errorMsg,
                data: errors
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 중복 확인
        //----------------------------------------------------------------------
        try {
            // 이메일 중복 확인
            const emailExists = await checkEmailExists(inputData.email);
            if (emailExists) {
                throw new Error("EMAIL_EXISTS");
            }
            
            // 사용자명 중복 확인
            const usernameExists = await checkUsernameExists(inputData.username);
            if (usernameExists) {
                throw new Error("USERNAME_EXISTS");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_duplicate_check);
            ret_data = {
                code: LOG_HEADER_TITLE + "(duplicate_check)",
                value: catch_duplicate_check,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            if (e.message === "EMAIL_EXISTS") {
                return res.status(409).json({
                    code: 'EMAIL_EXISTS',
                    msg: '이미 사용 중인 이메일입니다.'
                });
            }
            
            if (e.message === "USERNAME_EXISTS") {
                return res.status(409).json({
                    code: 'USERNAME_EXISTS',
                    msg: '이미 사용 중인 닉네임입니다.'
                });
            }
            
            return res.status(500).json({
                code: 'DUPLICATE_CHECK_ERROR',
                msg: '중복 확인 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 비밀번호 해싱
        //----------------------------------------------------------------------
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(inputData.password, 12);
        } catch (e) {
            ret_status = fail_status + (-1 * catch_password_hashing);
            ret_data = {
                code: LOG_HEADER_TITLE + "(password_hashing)",
                value: catch_password_hashing,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'HASHING_ERROR',
                msg: '비밀번호 처리 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 사용자 생성 (pcg_user_register 프로시저 호출)
        //----------------------------------------------------------------------
        let userCreationResult;
        try {
            const userId = generateUserId();
            const loginId = generateLoginId();
            
            // pcg_user_register 프로시저 호출
            userCreationResult = await callBusinessProcedure('pcg_user_register', [
                userId,                 // p_userid
                loginId,                // p_loginid  
                inputData.username,     // p_username
                inputData.email,        // p_email
                hashedPassword          // p_passwd
            ], ['p_created_user_id', 'p_created_login_id']);
            
            if (!userCreationResult.success) {
                throw new Error(userCreationResult.message || "User creation failed");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_user_creation);
            ret_data = {
                code: LOG_HEADER_TITLE + "(user_creation)",
                value: catch_user_creation,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'USER_CREATION_ERROR',
                msg: '회원가입 처리 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 출력층: 최종 성공 응답
        //----------------------------------------------------------------------
        const signupResult = {
            userId: userCreationResult.data.p_created_user_id,
            loginId: userCreationResult.data.p_created_login_id,
            username: inputData.username,
            email: inputData.email,
            created: new Date()
        };
        
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: signupResult,
            EXT_data: {
                ...EXT_data,
                userId: my_reqinfo.maskId(signupResult.userId),
                username: my_reqinfo.maskId(signupResult.username)
            }
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                userId: my_reqinfo.maskId(signupResult.userId),
                username: "***",
                email: my_reqinfo.maskId(signupResult.email),
                created: "***"
            }
        }, null, 2));
        
        return res.status(201).json({
            code: 'SIGNUP_SUCCESS',
            msg: '회원가입이 완료되었습니다.',
            data: {
                username: signupResult.username,
                email: signupResult.email
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
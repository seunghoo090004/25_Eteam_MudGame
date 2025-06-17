// routes/auth/verify.js - 프로시저 기반 리팩토링 (레퍼런스 패턴 적용)

'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../utils/reqinfo');
const { sendVerificationEmail, generateToken } = require('../../utils/emailUtils');
const csrf = require('csurf');
const { 
    callBusinessProcedure,
    callSelectProcedure,
    validateEmail,
    normalizeEmail,
    checkEmailExists
} = require('../../utils/dbUtils');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// 인증 코드 생성 함수 (처리층)
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

// 인증 코드 저장 및 관리를 위한 객체 (메모리 기반 - 실제 운영에서는 Redis 권장)
const verificationCodes = {};

//========================================================================
// POST /auth/verify/send-code - 이메일 인증 코드 발송
//========================================================================
router.post('/send-code', async(req, res) => {  // csrfProtection 임시 제거
    const LOG_HEADER_TITLE = "SEND_VERIFICATION_CODE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_email_check = -2;
    const catch_code_generation = -3;
    const catch_email_send = -4;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 요청 데이터 검증 및 추출
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { email } = req.body;
            
            if (!email) {
                throw new Error("Email is required");
            }
            
            if (!validateEmail(email)) {
                throw new Error("Invalid email format");
            }
            
            inputData = {
                email: normalizeEmail(email)
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
                msg: '유효한 이메일을 입력해주세요.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 이메일 중복 확인
        //----------------------------------------------------------------------
        try {
            const emailExists = await checkEmailExists(inputData.email);
            if (emailExists) {
                throw new Error("EMAIL_EXISTS");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_email_check);
            ret_data = {
                code: LOG_HEADER_TITLE + "(email_check)",
                value: catch_email_check,
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
            
            return res.status(500).json({
                code: 'EMAIL_CHECK_ERROR',
                msg: '이메일 확인 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 인증 코드 생성 및 저장
        //----------------------------------------------------------------------
        let verificationCode;
        try {
            verificationCode = generateVerificationCode();
            
            // 인증 코드 저장 (30분 후 만료)
            verificationCodes[inputData.email] = {
                code: verificationCode,
                expires: new Date(Date.now() + 30 * 60 * 1000), // 30분 후 만료
                attempts: 0
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
                code: 'CODE_GENERATION_ERROR',
                msg: '인증 코드 생성 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 이메일 발송
        //----------------------------------------------------------------------
        try {
            await sendVerificationEmail(
                inputData.email,
                `머드게임 이메일 인증 코드: ${verificationCode}`,
                `<h1>머드게임 이메일 인증</h1>
                <p>안녕하세요!</p>
                <p>머드게임 회원가입을 위한 이메일 인증 코드입니다.</p>
                <div style="font-size: 24px; font-weight: bold; color: #007bff; padding: 20px; background-color: #f8f9fa; border-radius: 5px; text-align: center; margin: 20px 0;">
                    ${verificationCode}
                </div>
                <p>이 코드는 30분간 유효합니다.</p>
                <p>코드를 회원가입 페이지에 입력해주세요.</p>
                <br>
                <p>머드게임 팀</p>`
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
            
            // 이메일 발송 실패 시 저장된 코드 제거
            delete verificationCodes[inputData.email];
            
            return res.status(500).json({
                code: 'EMAIL_SEND_ERROR',
                msg: '인증 이메일 발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 출력층: 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: { email: inputData.email, codeSent: true },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: { email: my_reqinfo.maskId(inputData.email), codeSent: true }
        }, null, 2));
        
        return res.status(200).json({
            code: 'CODE_SENT',
            msg: '인증 코드가 이메일로 발송되었습니다.',
            data: {
                email: inputData.email,
                expiresIn: 30 // 30분
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

//========================================================================
// POST /auth/verify/check-code - 인증 코드 확인 (프론트엔드 호환용)
//========================================================================
router.post('/check-code', async(req, res) => {
    const LOG_HEADER_TITLE = "CHECK_VERIFICATION_CODE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_code_verification = -2;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 요청 데이터 검증 및 추출
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { email, code } = req.body;
            
            if (!email || !code) {
                throw new Error("Email and code are required");
            }
            
            if (!validateEmail(email)) {
                throw new Error("Invalid email format");
            }
            
            if (!/^\d{6}$/.test(code)) {
                throw new Error("Invalid code format");
            }
            
            inputData = {
                email: normalizeEmail(email),
                code: code.trim()
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
                msg: '이메일과 6자리 인증 코드를 입력해주세요.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 인증 코드 검증
        //----------------------------------------------------------------------
        try {
            const storedData = verificationCodes[inputData.email];
            
            if (!storedData) {
                throw new Error("CODE_NOT_FOUND");
            }
            
            // 만료 시간 확인
            if (new Date() > storedData.expires) {
                delete verificationCodes[inputData.email];
                throw new Error("CODE_EXPIRED");
            }
            
            // 시도 횟수 증가
            storedData.attempts += 1;
            
            // 최대 시도 횟수 확인 (5회)
            if (storedData.attempts > 5) {
                delete verificationCodes[inputData.email];
                throw new Error("TOO_MANY_ATTEMPTS");
            }
            
            // 코드 일치 확인
            if (storedData.code !== inputData.code) {
                throw new Error("INVALID_CODE");
            }
            
            // 인증 성공 - 저장된 코드 제거
            delete verificationCodes[inputData.email];
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_code_verification);
            ret_data = {
                code: LOG_HEADER_TITLE + "(code_verification)",
                value: catch_code_verification,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            if (e.message === "CODE_NOT_FOUND") {
                return res.status(404).json({
                    code: 'CODE_NOT_FOUND',
                    msg: '인증 코드를 찾을 수 없습니다. 새로운 코드를 요청해주세요.'
                });
            }
            
            if (e.message === "CODE_EXPIRED") {
                return res.status(410).json({
                    code: 'CODE_EXPIRED',
                    msg: '인증 코드가 만료되었습니다. 새로운 코드를 요청해주세요.'
                });
            }
            
            if (e.message === "TOO_MANY_ATTEMPTS") {
                return res.status(429).json({
                    code: 'TOO_MANY_ATTEMPTS',
                    msg: '인증 시도 횟수를 초과했습니다. 새로운 코드를 요청해주세요.'
                });
            }
            
            if (e.message === "INVALID_CODE") {
                return res.status(400).json({
                    code: 'INVALID_CODE',
                    msg: '인증 코드가 일치하지 않습니다.'
                });
            }
            
            return res.status(500).json({
                code: 'VERIFICATION_ERROR',
                msg: '인증 코드 확인 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 출력층: 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: { email: inputData.email, verified: true },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: { email: my_reqinfo.maskId(inputData.email), verified: true }
        }, null, 2));
        
        return res.status(200).json({
            code: 'VERIFICATION_SUCCESS',
            msg: '이메일 인증이 완료되었습니다.',
            data: {
                email: inputData.email,
                verified: true
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

//========================================================================
// POST /auth/verify/confirm-code - 인증 코드 확인
//========================================================================
router.post('/confirm-code', async(req, res) => {  // csrfProtection 임시 제거
    const LOG_HEADER_TITLE = "CONFIRM_VERIFICATION_CODE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_code_verification = -2;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 요청 데이터 검증 및 추출
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { email, code } = req.body;
            
            if (!email || !code) {
                throw new Error("Email and code are required");
            }
            
            if (!validateEmail(email)) {
                throw new Error("Invalid email format");
            }
            
            if (!/^\d{6}$/.test(code)) {
                throw new Error("Invalid code format");
            }
            
            inputData = {
                email: normalizeEmail(email),
                code: code.trim()
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
                msg: '이메일과 6자리 인증 코드를 입력해주세요.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 인증 코드 검증
        //----------------------------------------------------------------------
        try {
            const storedData = verificationCodes[inputData.email];
            
            if (!storedData) {
                throw new Error("CODE_NOT_FOUND");
            }
            
            // 만료 시간 확인
            if (new Date() > storedData.expires) {
                delete verificationCodes[inputData.email];
                throw new Error("CODE_EXPIRED");
            }
            
            // 시도 횟수 증가
            storedData.attempts += 1;
            
            // 최대 시도 횟수 확인 (5회)
            if (storedData.attempts > 5) {
                delete verificationCodes[inputData.email];
                throw new Error("TOO_MANY_ATTEMPTS");
            }
            
            // 코드 일치 확인
            if (storedData.code !== inputData.code) {
                throw new Error("INVALID_CODE");
            }
            
            // 인증 성공 - 저장된 코드 제거
            delete verificationCodes[inputData.email];
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_code_verification);
            ret_data = {
                code: LOG_HEADER_TITLE + "(code_verification)",
                value: catch_code_verification,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            if (e.message === "CODE_NOT_FOUND") {
                return res.status(404).json({
                    code: 'CODE_NOT_FOUND',
                    msg: '인증 코드를 찾을 수 없습니다. 새로운 코드를 요청해주세요.'
                });
            }
            
            if (e.message === "CODE_EXPIRED") {
                return res.status(410).json({
                    code: 'CODE_EXPIRED',
                    msg: '인증 코드가 만료되었습니다. 새로운 코드를 요청해주세요.'
                });
            }
            
            if (e.message === "TOO_MANY_ATTEMPTS") {
                return res.status(429).json({
                    code: 'TOO_MANY_ATTEMPTS',
                    msg: '인증 시도 횟수를 초과했습니다. 새로운 코드를 요청해주세요.'
                });
            }
            
            if (e.message === "INVALID_CODE") {
                return res.status(400).json({
                    code: 'INVALID_CODE',
                    msg: '인증 코드가 일치하지 않습니다.'
                });
            }
            
            return res.status(500).json({
                code: 'VERIFICATION_ERROR',
                msg: '인증 코드 확인 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 출력층: 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: { email: inputData.email, verified: true },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: { email: my_reqinfo.maskId(inputData.email), verified: true }
        }, null, 2));
        
        return res.status(200).json({
            code: 'VERIFICATION_SUCCESS',
            msg: '이메일 인증이 완료되었습니다.',
            data: {
                email: inputData.email,
                verified: true
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

//========================================================================
// POST /auth/verify/resend-token - 인증 이메일 재발송 (토큰 기반)
//========================================================================
router.post('/resend-token', csrfProtection, async(req, res) => {
    const LOG_HEADER_TITLE = "RESEND_VERIFICATION_TOKEN";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(req.body.email) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_input_validation = -1;
    const catch_user_lookup = -2;
    const catch_token_generation = -3;
    const catch_token_update = -4;
    const catch_email_send = -5;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 요청 데이터 검증 및 추출
        //----------------------------------------------------------------------
        let inputData;
        try {
            const { email } = req.body;
            
            if (!email) {
                throw new Error("Email is required");
            }
            
            if (!validateEmail(email)) {
                throw new Error("Invalid email format");
            }
            
            inputData = {
                email: normalizeEmail(email)
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
                msg: '유효한 이메일을 입력해주세요.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 미인증 사용자 확인
        //----------------------------------------------------------------------
        let userInfo;
        try {
            // 이메일로 미인증 사용자 조회
            const userResult = await callSelectProcedure('pc_tuser_sel_by_email_unverified', [inputData.email]);
            
            if (!userResult.success || !userResult.data || userResult.data.length === 0) {
                throw new Error("USER_NOT_FOUND");
            }
            
            userInfo = userResult.data[0];
            
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
            
            if (e.message === "USER_NOT_FOUND") {
                return res.status(404).json({
                    code: 'USER_NOT_FOUND',
                    msg: '해당 이메일로 등록된 미인증 계정을 찾을 수 없습니다.'
                });
            }
            
            return res.status(500).json({
                code: 'USER_LOOKUP_ERROR',
                msg: '사용자 조회 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 새 인증 토큰 생성
        //----------------------------------------------------------------------
        let verificationToken, expiresAt;
        try {
            verificationToken = generateToken();
            expiresAt = new Date();
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
                code: 'TOKEN_GENERATION_ERROR',
                msg: '인증 토큰 생성 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 인증 토큰 업데이트
        //----------------------------------------------------------------------
        try {
            const tokenUpdateResult = await callBusinessProcedure('pcg_email_verification_set', [
                userInfo.id,           // p_userid
                verificationToken,     // p_verification_token
                expiresAt             // p_verification_expires
            ], []);
            
            if (!tokenUpdateResult.success) {
                throw new Error(tokenUpdateResult.message || "Token update failed");
            }
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_token_update);
            ret_data = {
                code: LOG_HEADER_TITLE + "(token_update)",
                value: catch_token_update,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'TOKEN_UPDATE_ERROR',
                msg: '인증 토큰 업데이트 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 처리층: 인증 이메일 재발송
        //----------------------------------------------------------------------
        try {
            const verificationUrl = `${req.protocol}://${req.get('host')}/auth/verify?token=${verificationToken}`;
            
            await sendVerificationEmail(
                inputData.email,
                '머드게임 이메일 인증 (재발송)',
                `<h1>머드게임 이메일 인증</h1>
                <p>안녕하세요, ${userInfo.username}님!</p>
                <p>요청하신 이메일 인증 링크를 재발송해드립니다.</p>
                <p>아래 링크를 클릭하여 이메일 인증을 완료해주세요:</p>
                <p><a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">이메일 인증하기</a></p>
                <p>이 링크는 24시간 후 만료됩니다.</p>
                <p>만약 이메일 인증을 요청하지 않으셨다면, 이 이메일을 무시해주세요.</p>
                <br>
                <p>머드게임 팀</p>`
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
                code: 'EMAIL_SEND_ERROR',
                msg: '인증 이메일 재발송 중 오류가 발생했습니다.'
            });
        }
        
        //----------------------------------------------------------------------
        // 출력층: 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: LOG_HEADER_TITLE + "(success)",
            value: 1,
            value_ext1: ret_status,
            value_ext2: { email: inputData.email, tokenResent: true },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: { email: my_reqinfo.maskId(inputData.email), tokenResent: true }
        }, null, 2));
        
        return res.status(200).json({
            code: 'TOKEN_RESENT',
            msg: '인증 이메일이 재발송되었습니다.',
            data: {
                email: inputData.email,
                expiresIn: 24 // 24시간
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
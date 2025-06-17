// utils/dbUtils.js - 3티어 패턴 DB 유틸리티 (레퍼런스 패턴 적용) - 보완 완료

'use strict';
const { callProcedure, callSelectProcedure, callBusinessProcedure } = require('../config/database');
const my_reqinfo = require('./reqinfo');
const { v4: uuidv4 } = require('uuid');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

//============================================================================================
// UUID 생성 함수들
//============================================================================================

function generateUserId() {
    // UUID v4를 생성하고 하이픈 제거하여 32자리 문자열로 변환
    return uuidv4().replace(/-/g, '');
}

function generateLoginId() {
    // 로그인 ID 생성 (tlogin 테이블용)
    return uuidv4().replace(/-/g, '');
}

function generateGameId() {
    // 게임 ID 생성
    return uuidv4().replace(/-/g, '');
}

function generateAttemptId() {
    // 로그인 시도 ID 생성
    return uuidv4().replace(/-/g, '');
}

//============================================================================================
// 입력값 검증 헬퍼 함수들
//============================================================================================

function validateUserId(userId) {
    return userId && typeof userId === 'string' && userId.length >= 7;
}

function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
}

function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return false;
    }
    // 2~50자의 한글, 영문, 숫자 허용 (특수문자 제외)
    const usernameRegex = /^[가-힣a-zA-Z0-9]{2,50}$/;
    return usernameRegex.test(username.trim());
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return false;
    }
    // 최소 8자, 대문자, 소문자, 숫자 포함
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return passwordRegex.test(password);
}

function validateGameId(gameId) {
    return gameId && typeof gameId === 'string' && gameId.length >= 7;
}

function validateThreadId(threadId) {
    return threadId && typeof threadId === 'string' && threadId.length >= 7;
}

function validateAssistantId(assistantId) {
    return assistantId && typeof assistantId === 'string' && assistantId.length >= 7;
}

//============================================================================================
// 고급 프로시저 호출 함수들 (OUT 파라미터 지원)
//============================================================================================

async function callUserSelectProcedure(procedureName, inputParams = []) {
    const LOG_HEADER_TITLE = "CALL_USER_SELECT_PROCEDURE";
    const LOG_HEADER = "Procedure[" + procedureName + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_procedure_call = -1;
    const catch_result_parse = -2;
    
    const EXT_data = { 
        procedureName, 
        inputParamsCount: inputParams.length
    };
    
    try {
        //----------------------------------------------------------------------
        // 프로시저 호출
        //----------------------------------------------------------------------
        let procedureResult;
        try {
            procedureResult = await callBusinessProcedure(procedureName, inputParams, 
                ['p_username', 'p_email', 'p_email_verified']);
            
            if (!procedureResult.success) {
                throw new Error(procedureResult.message || "Procedure call failed");
            }
            
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
            throw new Error("Database operation failed: " + e.message);
        }
        
        //----------------------------------------------------------------------
        // 결과 처리
        //----------------------------------------------------------------------
        try {
            const userData = {
                username: procedureResult.data.p_username,
                email: procedureResult.data.p_email,
                email_verified: procedureResult.data.p_email_verified
            };
            
            const successResult = {
                success: true,
                code: procedureResult.code,
                message: procedureResult.message,
                data: userData
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { success: true, code: procedureResult.code, message: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_result_parse);
            ret_data = {
                code: LOG_HEADER_TITLE + "(result_parse)",
                value: catch_result_parse,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error("Result parsing failed: " + e.message);
        }
        
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
        throw error;
    }
}

async function callLoginSelectProcedure(procedureName, inputParams = []) {
    const LOG_HEADER_TITLE = "CALL_LOGIN_SELECT_PROCEDURE";
    const LOG_HEADER = "Procedure[" + procedureName + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_procedure_call = -1;
    const catch_result_parse = -2;
    
    const EXT_data = { 
        procedureName, 
        inputParamsCount: inputParams.length
    };
    
    try {
        //----------------------------------------------------------------------
        // 프로시저 호출
        //----------------------------------------------------------------------
        let procedureResult;
        try {
            procedureResult = await callBusinessProcedure(procedureName, inputParams, 
                ['p_passwd', 'p_userid', 'p_reset_token', 'p_reset_expires', 
                 'p_verification_token', 'p_verification_expires']);
            
            if (!procedureResult.success) {
                throw new Error(procedureResult.message || "Procedure call failed");
            }
            
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
            throw new Error("Database operation failed: " + e.message);
        }
        
        //----------------------------------------------------------------------
        // 결과 처리
        //----------------------------------------------------------------------
        try {
            const loginData = {
                passwd: procedureResult.data.p_passwd,
                userid: procedureResult.data.p_userid,
                reset_token: procedureResult.data.p_reset_token,
                reset_expires: procedureResult.data.p_reset_expires,
                verification_token: procedureResult.data.p_verification_token,
                verification_expires: procedureResult.data.p_verification_expires
            };
            
            const successResult = {
                success: true,
                code: procedureResult.code,
                message: procedureResult.message,
                data: loginData
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { success: true, code: procedureResult.code, message: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_result_parse);
            ret_data = {
                code: LOG_HEADER_TITLE + "(result_parse)",
                value: catch_result_parse,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error("Result parsing failed: " + e.message);
        }
        
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
        throw error;
    }
}

//============================================================================================
// 이메일 중복 확인 함수
//============================================================================================

async function checkEmailExists(email) {
    const LOG_HEADER_TITLE = "CHECK_EMAIL_EXISTS";
    const LOG_HEADER = "Email[" + my_reqinfo.maskId(email) + "] --> " + LOG_HEADER_TITLE;
    
    try {
        // 이메일로 사용자 조회 시도
        const users = await callSelectProcedure('pc_tuser_sel_by_email', [email]);
        
        // 사용자가 존재하면 true, 없으면 false
        const exists = users.success && users.data && users.data.length > 0;
        
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Email exists:", exists);
        return exists;
        
    } catch (error) {
        // 에러 발생 시 false 반환 (안전한 기본값)
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Error checking email:", error.message);
        return false;
    }
}

//============================================================================================
// 사용자명 중복 확인 함수
//============================================================================================

async function checkUsernameExists(username) {
    const LOG_HEADER_TITLE = "CHECK_USERNAME_EXISTS";
    const LOG_HEADER = "Username[" + my_reqinfo.maskId(username) + "] --> " + LOG_HEADER_TITLE;
    
    try {
        // 사용자명으로 사용자 조회 시도
        const users = await callSelectProcedure('pc_tuser_sel_by_username', [username]);
        
        // 사용자가 존재하면 true, 없으면 false
        const exists = users.success && users.data && users.data.length > 0;
        
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Username exists:", exists);
        return exists;
        
    } catch (error) {
        // 에러 발생 시 false 반환 (안전한 기본값)
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Error checking username:", error.message);
        return false;
    }
}

//============================================================================================
// 로그인 시도 로깅 함수
//============================================================================================

async function logLoginAttempt(userId, ipAddress, status, errorReason = null) {
    const LOG_HEADER_TITLE = "LOG_LOGIN_ATTEMPT";
    const LOG_HEADER = "UserId[" + my_reqinfo.maskId(userId) + "] Status[" + status + "] --> " + LOG_HEADER_TITLE;
    
    try {
        const attemptId = generateAttemptId();
        
        const result = await callProcedure('pc_tlogin_attempts_ins', [
            attemptId,
            userId,
            ipAddress,
            status,
            errorReason
        ]);
        
        if (result.success) {
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + " Login attempt logged successfully");
        } else {
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Failed to log login attempt:", result.message);
        }
        
        return result;
        
    } catch (error) {
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Error logging login attempt:", error.message);
        // 로깅 실패는 치명적이지 않으므로 계속 진행
        return { success: false, message: error.message };
    }
}

//============================================================================================
// 입력값 정규화 함수들
//============================================================================================

function normalizeEmail(email) {
    if (!email || typeof email !== 'string') {
        return null;
    }
    return email.toLowerCase().trim();
}

function normalizeUsername(username) {
    if (!username || typeof username !== 'string') {
        return null;
    }
    return username.trim();
}

//============================================================================================
// 에러 메시지 표준화 함수
//============================================================================================

function getValidationErrorMessage(field, value) {
    const messages = {
        email: '유효한 이메일 주소를 입력해주세요.',
        username: '사용자명은 2~50자의 한글, 영문, 숫자만 사용 가능합니다.',
        password: '비밀번호는 8자 이상이며, 대문자, 소문자, 숫자를 포함해야 합니다.',
        userId: '유효하지 않은 사용자 ID입니다.',
        gameId: '유효하지 않은 게임 ID입니다.',
        threadId: '유효하지 않은 스레드 ID입니다.',
        assistantId: '유효하지 않은 어시스턴트 ID입니다.'
    };
    
    return messages[field] || `유효하지 않은 ${field}입니다.`;
}

//============================================================================================
// 모듈 내보내기
//============================================================================================

module.exports = {
    // 프로시저 호출 함수들
    callProcedure,
    callSelectProcedure,
    callBusinessProcedure,
    callUserSelectProcedure,
    callLoginSelectProcedure,
    
    // UUID 생성 함수들
    generateUserId,
    generateLoginId,
    generateGameId,
    generateAttemptId,
    
    // 검증 함수들
    validateUserId,
    validateEmail,
    validateUsername,
    validatePassword,
    validateGameId,
    validateThreadId,
    validateAssistantId,
    
    // 중복 확인 함수들
    checkEmailExists,
    checkUsernameExists,
    
    // 로깅 함수들
    logLoginAttempt,
    
    // 정규화 함수들
    normalizeEmail,
    normalizeUsername,
    
    // 유틸리티 함수들
    getValidationErrorMessage
};
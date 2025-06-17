// utils/userIdSanitizer.js - userId 정제 및 검증 유틸리티

'use strict';
const my_reqinfo = require('./reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

/**
 * 세션에서 올바른 userId를 추출하는 함수
 * @param {Object} session - 세션 객체
 * @param {string} source - 로그용 소스 식별자
 * @returns {string|null} - 정제된 userId 또는 null
 */
function extractValidUserId(session, source = 'unknown') {
    const LOG_HEADER_TITLE = "EXTRACT_VALID_USERID";
    const LOG_HEADER = `${source} --> ${LOG_HEADER_TITLE}`;

    try {
        if (!session) {
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " No session provided");
            return null;
        }

        let userId = session.userId;
        
        if (!userId) {
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " No userId in session");
            return null;
        }

        // **🔧 타입별 처리**
        if (typeof userId === 'string') {
            // 문자열인 경우 길이 검증
            if (userId.length >= 7 && userId.length <= 32) {
                console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + " Valid string userId found:", {
                    userId: my_reqinfo.maskId(userId),
                    length: userId.length
                });
                return userId;
            }
            
            // 긴 문자열인 경우 JSON 파싱 시도
            if (userId.length > 32) {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " UserId too long, attempting JSON parse:", {
                    userId: my_reqinfo.maskId(userId),
                    length: userId.length,
                    preview: userId.substring(0, 50) + "..."
                });
                
                // JSON 문자열일 가능성 체크
                if (userId.startsWith('{') || userId.startsWith('[')) {
                    try {
                        const parsed = JSON.parse(userId);
                        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Found JSON object in userId field:", {
                            type: typeof parsed,
                            hasPlayer: !!parsed.player,
                            hasLocation: !!parsed.location
                        });
                        
                        // 세션 손상 - 정제 불가
                        return null;
                    } catch (e) {
                        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid JSON in userId field");
                        return null;
                    }
                }
            }
        }
        
        // 객체인 경우
        if (typeof userId === 'object') {
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " UserId is object type:", {
                type: typeof userId,
                isArray: Array.isArray(userId),
                hasPlayer: !!userId?.player,
                keys: Object.keys(userId || {}).slice(0, 5)
            });
            return null;
        }
        
        // 기타 타입
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid userId type:", {
            type: typeof userId,
            value: userId
        });
        return null;

    } catch (e) {
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Error processing userId:", {
            error: e.message,
            sessionKeys: Object.keys(session || {})
        });
        return null;
    }
}

/**
 * 세션 정제 함수 - 손상된 세션 데이터 정리
 * @param {Object} session - 세션 객체
 * @param {string} source - 로그용 소스 식별자
 * @returns {boolean} - 정제 성공 여부
 */
function sanitizeSession(session, source = 'unknown') {
    const LOG_HEADER_TITLE = "SANITIZE_SESSION";
    const LOG_HEADER = `${source} --> ${LOG_HEADER_TITLE}`;

    try {
        if (!session) {
            return false;
        }

        let needsCleanup = false;
        
        // userId 검증
        const validUserId = extractValidUserId(session, source);
        if (!validUserId && session.userId) {
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Removing invalid userId from session");
            delete session.userId;
            needsCleanup = true;
        }

        // 게임 데이터가 다른 필드에 잘못 저장된 경우 정리
        ['username', 'email'].forEach(field => {
            if (session[field] && typeof session[field] === 'object') {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ` Removing object from ${field} field`);
                delete session[field];
                needsCleanup = true;
            }
        });

        if (needsCleanup) {
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Session sanitized, cleanup needed");
            return false; // 재로그인 필요
        }

        return true; // 세션 정상
        
    } catch (e) {
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Error sanitizing session:", e.message);
        return false;
    }
}

/**
 * 세션에서 안전한 userId 추출 (인증 미들웨어용)
 * @param {Object} session - 세션 객체
 * @param {string} source - 로그용 소스 식별자
 * @returns {string|null} - 유효한 userId 또는 null
 */
function getSafeUserId(session, source = 'auth') {
    // 1. 세션 정제 시도
    const isSessionValid = sanitizeSession(session, source);
    
    if (!isSessionValid) {
        // 세션 손상된 경우 파기
        if (session && typeof session.destroy === 'function') {
            session.destroy();
        }
        return null;
    }
    
    // 2. 유효한 userId 추출
    return extractValidUserId(session, source);
}

module.exports = {
    extractValidUserId,
    sanitizeSession,
    getSafeUserId
};
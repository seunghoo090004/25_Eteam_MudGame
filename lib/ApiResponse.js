/**
 * 통일된 API 응답 포맷 제공
 * 모든 API 엔드포인트에서 이 클래스 사용
 */
class ApiResponse {
    /**
     * 성공 응답
     * @param {*} data - 응답 데이터
     * @param {string} message - 메시지
     * @param {number} statusCode - HTTP 상태코드 (기본값: 200)
     * @returns {object} 표준화된 응답 객체
     */
    static success(data = null, message = 'Success', statusCode = 200) {
        return {
            success: true,
            code: statusCode,
            message,
            data,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 에러 응답
     * @param {number} statusCode - HTTP 상태코드
     * @param {string} message - 에러 메시지
     * @param {string} code - 에러 코드 (예: "INVALID_INPUT")
     * @param {object} details - 추가 세부정보
     * @returns {object} 표준화된 에러 응답
     */
    static error(statusCode, message, code = 'INTERNAL_ERROR', details = null) {
        return {
            success: false,
            code: statusCode,
            errorCode: code,
            message,
            details,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 인증 실패 응답
     */
    static unauthorized(message = 'Authentication required', details = null) {
        return this.error(401, message, 'UNAUTHORIZED', details);
    }

    /**
     * 권한 부족 응답
     */
    static forbidden(message = 'Forbidden', details = null) {
        return this.error(403, message, 'FORBIDDEN', details);
    }

    /**
     * 리소스 없음 응답
     */
    static notFound(message = 'Resource not found', details = null) {
        return this.error(404, message, 'NOT_FOUND', details);
    }

    /**
     * 입력값 검증 실패 응답
     */
    static validationError(details = {}) {
        return this.error(400, 'Validation failed', 'VALIDATION_ERROR', details);
    }

    /**
     * 서버 에러 응답
     */
    static internalError(message = 'Internal server error', details = null) {
        return this.error(500, message, 'INTERNAL_ERROR', details);
    }
}

module.exports = ApiResponse;

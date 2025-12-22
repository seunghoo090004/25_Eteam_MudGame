/**
 * 커스텀 애플리케이션 에러
 * 모든 예상된 에러는 이 클래스를 상속받아 사용
 */
class AppError extends Error {
    constructor(
        statusCode = 500,
        message = 'Internal Server Error',
        code = 'INTERNAL_ERROR',
        details = null
    ) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();

        // 스택 트레이스 유지
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * 에러를 API 응답으로 변환
     */
    toJSON() {
        return {
            success: false,
            code: this.statusCode,
            errorCode: this.code,
            message: this.message,
            details: this.details,
            timestamp: this.timestamp
        };
    }

    /**
     * 유효성 검사 에러
     */
    static validation(message, details = {}) {
        return new AppError(400, message, 'VALIDATION_ERROR', details);
    }

    /**
     * 인증 에러
     */
    static unauthorized(message = 'Authentication required', details = null) {
        return new AppError(401, message, 'UNAUTHORIZED', details);
    }

    /**
     * 권한 부족 에러
     */
    static forbidden(message = 'Forbidden', details = null) {
        return new AppError(403, message, 'FORBIDDEN', details);
    }

    /**
     * 리소스 없음 에러
     */
    static notFound(message = 'Resource not found', details = null) {
        return new AppError(404, message, 'NOT_FOUND', details);
    }

    /**
     * 충돌 에러 (중복 등)
     */
    static conflict(message, details = null) {
        return new AppError(409, message, 'CONFLICT', details);
    }
}

module.exports = AppError;

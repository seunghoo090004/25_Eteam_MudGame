/**
 * 중앙화된 로깅 시스템
 * 모든 로그는 이 클래스를 통해 기록
 */
class Logger {
    /**
     * 정보 로그
     * @param {string} context - 로그 컨텍스트 (예: "AUTH/LOGIN")
     * @param {string} message - 메시지
     * @param {object} data - 추가 데이터
     */
    static info(context, message, data = {}) {
        const logEntry = this._formatLog('INFO', context, message, data);
        console.log(logEntry);
    }

    /**
     * 경고 로그
     */
    static warn(context, message, data = {}) {
        const logEntry = this._formatLog('WARN', context, message, data);
        console.warn(logEntry);
    }

    /**
     * 에러 로그
     */
    static error(context, message, error = null) {
        const logEntry = this._formatLog('ERROR', context, message, {
            errorMessage: error?.message || error,
            stack: error?.stack || null,
            code: error?.code || null
        });
        console.error(logEntry);
    }

    /**
     * 디버그 로그 (개발 모드에서만)
     */
    static debug(context, message, data = {}) {
        if (process.env.NODE_ENV !== 'production') {
            const logEntry = this._formatLog('DEBUG', context, message, data);
            console.log(logEntry);
        }
    }

    /**
     * 성능 측정 로그
     */
    static perf(context, message, durationMs) {
        const logEntry = this._formatLog('PERF', context, message, {
            durationMs,
            slow: durationMs > 1000
        });
        console.log(logEntry);
    }

    /**
     * 로그 항목 포맷팅
     */
    static _formatLog(level, context, message, data) {
        const timestamp = new Date().toISOString();
        const dataStr = Object.keys(data).length > 0 
            ? JSON.stringify(data) 
            : '';
        return `[${timestamp}] [${level}] [${context}] ${message} ${dataStr}`.trim();
    }

    /**
     * 요청 로깅 미들웨어 생성
     */
    static requestLogger() {
        return (req, res, next) => {
            const start = Date.now();
            const originalSend = res.send;

            res.send = function(data) {
                const duration = Date.now() - start;
                const context = `${req.method} ${req.path}`;
                
                Logger.info(context, `Response sent`, {
                    statusCode: res.statusCode,
                    durationMs: duration,
                    userId: req.session?.userId || 'anonymous'
                });

                originalSend.call(this, data);
            };

            next();
        };
    }
}

module.exports = Logger;

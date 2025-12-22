// middleware/auth.js
// 사용자 인증 상태 확인 및 세션 관리 미들웨어

const AppError = require('../lib/AppError');
const Logger = require('../lib/Logger');

/**
 * 세션 기반 인증 미들웨어
 * @returns {Function} Express 미들웨어
 */
const authenticate = (req, res, next) => {
    const context = 'MIDDLEWARE/AUTH/AUTHENTICATE';

    try {
        if (!req.session.userId) {
            Logger.warn(context, 'Authentication failed: No session');
            return next(AppError.unauthorized());
        }

        Logger.debug(context, 'Authentication successful', {
            userId: req.session.userId
        });

        // req.user 객체 설정
        req.user = {
            id: req.session.userId,
            username: req.session.username
        };

        next();
    } catch (e) {
        Logger.error(context, 'Unexpected error', e);
        next(AppError.internalError());
    }
};

/**
 * Socket.IO 인증 미들웨어
 * @returns {Function} Socket.IO 미들웨어
 */
const socketAuth = (socket, next) => {
    const context = 'MIDDLEWARE/AUTH/SOCKET';

    try {
        const userId = socket.request.session?.userId;

        if (!userId) {
            Logger.warn(context, 'Socket authentication failed');
            return next(new AppError(401, 'Authentication required'));
        }

        // Socket에 사용자 정보 추가
        socket.userId = userId;
        socket.username = socket.request.session.username;

        Logger.debug(context, 'Socket authenticated', { userId });
        next();
    } catch (error) {
        Logger.error(context, 'Socket auth error', error);
        next(error);
    }
};

module.exports = {
    authenticate,
    socketAuth,
    // 하위 호환성 (기존 코드용)
    auth: authenticate
};
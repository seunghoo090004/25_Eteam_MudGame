// middleware/auth.js
// 사용자 인증 상태 확인 및 세션 관리 미들웨어
const jwt = require('jsonwebtoken');
const AppError = require('../lib/AppError');
const Logger = require('../lib/Logger');

/**
 * 세션 기반 인증 미들웨어(기존 - 유지)
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
 * ✅ JWT 토큰 인증 미들웨어 (새로 추가 - Unity용)
 * @returns {Function} Express 미들웨어
 */
const authenticateJWT = (req, res, next) => {
    const context = 'MIDDLEWARE/AUTH/JWT';
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
    
    if (!token) {
        Logger.warn(context, 'JWT authentication failed: No token');
        return next(AppError.unauthorized('No token provided'));
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            Logger.warn(context, 'JWT verification failed', { error: err.message });
            return next(AppError.unauthorized('Invalid or expired token'));
        }
        
        // ✅ 세션 형식과 동일하게 설정 (호환성)
        req.session = req.session || {};
        req.session.userId = decoded.userId;
        req.session.username = decoded.username;
        
        // req.user 객체도 설정
        req.user = {
            id: decoded.userId,
            username: decoded.username,
            email: decoded.email
        };
        
        Logger.debug(context, 'JWT authentication successful', {
            userId: decoded.userId
        });
        
        next();
    });
};

/**
 * ✅ 세션 또는 JWT 인증 (하이브리드 - Unity + 웹 모두 지원)
 * @returns {Function} Express 미들웨어
 */
const authenticateUser = (req, res, next) => {
    const context = 'MIDDLEWARE/AUTH/HYBRID';
    
    // 1. JWT 토큰 확인 (Unity)
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        Logger.debug(context, 'Using JWT authentication');
        return authenticateJWT(req, res, next);
    }
    
    // 2. 세션 확인 (웹 - 이미 제거했지만 호환성 유지)
    if (req.session && req.session.userId) {
        Logger.debug(context, 'Using session authentication');
        req.user = {
            id: req.session.userId,
            username: req.session.username
        };
        return next();
    }
    
    // 3. 둘 다 없으면 인증 실패
    Logger.warn(context, 'Authentication failed: No session or token');
    return next(AppError.unauthorized('Authentication required'));
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
    authenticate,           // 세션 전용 (기존)
    authenticateJWT,        // ✅ JWT 전용 (새로 추가)
    authenticateUser,       // ✅ 하이브리드 (새로 추가)
    socketAuth,            // Socket.IO용 (기존)
    auth: authenticate     // 하위 호환성
};
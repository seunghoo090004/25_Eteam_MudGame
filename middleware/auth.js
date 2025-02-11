// middleware/auth.js
//사용자 인증 상태 확인 및 세션 관리 미들웨어
const auth = (req, res, next) => {
    const LOG_HEADER = "AUTH/MIDDLEWARE";

    try {
        // 세션에서 사용자 ID 확인
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] Authentication failed: No session`);
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // API 요청인 경우 (AJAX)
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            console.log(`[${LOG_HEADER}] API authentication successful`);
        } 
        // 페이지 요청인 경우
        else {
            console.log(`[${LOG_HEADER}] Page authentication successful`);
        }

        next();

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return res.status(500).json({
            success: false,
            error: 'Internal authentication error'
        });
    }
    };

    //============================================================================================
    // Socket.IO용 인증 미들웨어
    //============================================================================================
    const socketAuth = (socket, next) => {
    const LOG_HEADER = "AUTH/SOCKET";

    try {
        const userId = socket.request.session.userId;
        
        if (!userId) {
            console.log(`[${LOG_HEADER}] Socket authentication failed`);
            return next(new Error('Authentication required'));
        }

        console.log(`[${LOG_HEADER}] Socket authenticated`);
        next();

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        next(new Error('Authentication error'));
    }
};

module.exports = {
    auth,
    socketAuth
};
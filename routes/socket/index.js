// routes/socket/index.js
// Socket.IO 서버 설정 및 이벤트 라우팅


const gameHandler = require('./handlers/game');
const chatHandler = require('./handlers/chat');

module.exports = function(server, sessionMiddleware) {
    const io = require('socket.io')(server);
    
    //============================================================================================
    // 세션 미들웨어 적용
    //============================================================================================
    io.use((socket, next) => {
        const LOG_HEADER = "SOCKET/SESSION";
        try {
            sessionMiddleware(socket.request, socket.request.res || {}, next);
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            next(new Error('Session error'));
        }
    });

    //============================================================================================
    // 인증 미들웨어
    //============================================================================================
    io.use((socket, next) => {
        const LOG_HEADER = "SOCKET/AUTH";
        
        if (!socket.request.session.userId) {
            console.log(`[${LOG_HEADER}] Authentication failed`);
            next(new Error('Authentication required'));
        } else {
            console.log(`[${LOG_HEADER}] User authenticated`);
            next();
        }
    });

    //============================================================================================
    // 소켓 연결 처리
    //============================================================================================
    io.on('connection', (socket) => {
        const LOG_HEADER = "SOCKET/CONNECTION";
        console.log(`[${LOG_HEADER}] New connection established`);

        // 게임과 채팅 핸들러 연결
        gameHandler(io, socket);
        chatHandler(io, socket);

        // 연결 해제 처리
        socket.on('disconnect', () => {
            console.log(`[${LOG_HEADER}] Connection closed`);
        });

        // 에러 처리
        socket.on('error', (error) => {
            console.error(`[${LOG_HEADER}] Error: ${error.message || error}`);
            socket.emit('error', {
                success: false,
                error: error.message || 'An unexpected error occurred'
            });
        });

        // 핑/퐁 처리
        socket.on('ping', () => {
            console.log(`[${LOG_HEADER}] Ping received`);
            socket.emit('pong');
        });
    });
    
    //============================================================================================
    // 서버 에러 처리
    //============================================================================================
    io.on('error', (error) => {
        const LOG_HEADER = "SOCKET/SERVER";
        console.error(`[${LOG_HEADER}] Server error: ${error.message || error}`);
    });
    
    return io;
};
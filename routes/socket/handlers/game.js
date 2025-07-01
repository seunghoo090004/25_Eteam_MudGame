// routes/socket/handlers/game.js
// Socket 전용 게임 핸들러 (채팅 초기화만 담당)

const gameService = require('../services/game');
const chatService = require('../services/chat');

const gameHandler = (io, socket) => {
    // ✅ 유지: 새 게임 (초기 메시지 생성용)
    socket.on('new game', async (data) => {
        const LOG_HEADER = "SOCKET/NEW_GAME";
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.assistant_id) throw new Error("Assistant ID required");
    
            // 초기 메시지만 생성
            const initialResponse = await chatService.initializeChat(data.thread_id, data.assistant_id);
            
            socket.emit('new game response', {
                success: true,
                game_id: data.game_id,
                game_data: data.game_data,
                initial_message: initialResponse
            });
    
            console.log(`[${LOG_HEADER}] Initial message sent`);
    
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('new game response', {
                success: false,
                error: e.message || e
            });
        }
    });

    // ✅ 유지: 게임 로드 (채팅 히스토리용)
    socket.on('load game', async (data) => {
        const LOG_HEADER = "SOCKET/LOAD_GAME";
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
    
            const gameData = await gameService.loadGameForSocket(data.game_id, userId);
            
            console.log(`[${LOG_HEADER}] Game loaded for socket`);
            socket.emit('load game response', {
                success: true,
                game: gameData
            });
    
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('load game response', {
                success: false,
                error: e.message || e
            });
        }
    });

    // ❌ 제거: save game, delete game, get games list
    // 이제 API에서 처리
};

module.exports = gameHandler;
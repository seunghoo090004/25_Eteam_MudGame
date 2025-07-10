// routes/socket/handlers/game.js - 수정된 버전

const gameService = require('../services/game');
const chatService = require('../services/chat');

const gameHandler = (io, socket) => {
    // 새 게임 초기 메시지 생성
    socket.on('new game', async (data) => {
        const LOG_HEADER = "SOCKET/NEW_GAME";
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            
            if (!data.assistant_id) throw new Error("Assistant ID required");
            if (!data.thread_id) throw new Error("Thread ID required");
            if (!data.game_id) throw new Error("Game ID required");
            
            console.log(`[${LOG_HEADER}] Received data:`, {
                assistant_id: data.assistant_id,
                thread_id: data.thread_id,
                game_id: data.game_id,
                has_game_data: !!data.game_data
            });
    
            const initialResponse = await chatService.initializeChat(data.thread_id, data.assistant_id);
            
            socket.emit('new game response', {
                success: true,
                game_id: data.game_id,
                game_data: data.game_data,
                initial_message: initialResponse
            });
    
            console.log(`[${LOG_HEADER}] Initial message sent successfully`);
    
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('new game response', {
                success: false,
                error: e.message || e
            });
        }
    });

    // 게임 로드 (채팅 히스토리용)
    socket.on('load game', async (data) => {
        const LOG_HEADER = "SOCKET/LOAD_GAME";
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
            
            console.log(`[${LOG_HEADER}] Loading game for socket:`, {
                game_id: data.game_id,
                user_id: userId
            });
    
            const gameData = await gameService.loadGameForSocket(data.game_id, userId);
            
            console.log(`[${LOG_HEADER}] Game loaded for socket successfully`);
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
};

module.exports = gameHandler;
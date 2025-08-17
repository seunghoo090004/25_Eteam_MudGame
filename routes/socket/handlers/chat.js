// routes/socket/handlers/chat.js - 메서드 이름 수정

const chatService = require('../services/chat');
const gameService = require('../services/game');

const chatHandler = (io, socket) => {
    // 채팅 메시지 처리
    socket.on('chat message', async (data) => {
        const LOG_HEADER = "SOCKET/CHAT_MESSAGE";
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            
            if (!data.message) throw new Error("Message required");
            if (!data.game_id) throw new Error("Game ID required");
            
            console.log(`[${LOG_HEADER}] Processing message:`, {
                game_id: data.game_id,
                message: data.message,
                user_id: userId
            });

            // 게임 로드
            const gameData = await gameService.loadGameForSocket(data.game_id, userId);
            
            // AI 메시지 전송
            const aiResponse = await chatService.sendMessage(
                gameData.thread_id,
                gameData.assistant_id,
                data.message
            );

            // 게임 상태 파싱 (올바른 메서드 이름 사용)
            const parsedState = await chatService.parseGameStateFromResponse(aiResponse);
            
            // 게임 상태 업데이트
            let updatedGameData = JSON.parse(gameData.game_data);
            
            if (parsedState) {
                if (parsedState.turn_count) {
                    updatedGameData.turn_count = parsedState.turn_count;
                }
                
                if (parsedState.location) {
                    updatedGameData.location = parsedState.location;
                }
                
                if (parsedState.discoveries) {
                    updatedGameData.discoveries = parsedState.discoveries;
                }
                
                if (parsedState.is_dead) {
                    updatedGameData.death_count = (updatedGameData.death_count || 0) + 1;
                    updatedGameData.death_cause = parsedState.death_cause;
                }
            }

            // DB 업데이트
            await gameService.updateGameState(data.game_id, updatedGameData);

            console.log(`[${LOG_HEADER}] Message processed successfully`);
            
            socket.emit('chat response', {
                success: true,
                response: aiResponse,
                game_state: updatedGameData
            });

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('chat response', {
                success: false,
                error: e.message || e
            });
        }
    });

    // 채팅 히스토리 요청
    socket.on('get chat history', async (data) => {
        const LOG_HEADER = "SOCKET/CHAT_HISTORY";
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
            
            const gameData = await gameService.loadGameForSocket(data.game_id, userId);
            const history = await chatService.getMessageHistory(gameData.thread_id);
            
            socket.emit('chat history response', {
                success: true,
                history: history
            });

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('chat history response', {
                success: false,
                error: e.message || e
            });
        }
    });
};

module.exports = chatHandler;
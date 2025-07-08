// routes/socket/handlers/chat.js - Socket 전용 버전

const gameService = require('../services/game');
const chatService = require('../services/chat');

const chatHandler = (io, socket) => {
    socket.on('chat message', async (data) => {
        const LOG_HEADER = "SOCKET/CHAT_MESSAGE";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
            if (!data.message) throw new Error("Message required");

            let safeMessage = data.message;
            if (typeof safeMessage !== 'string') {
                safeMessage = String(safeMessage);
            }

            // Socket 서비스에서 게임 로드
            const game = await gameService.loadGameForSocket(data.game_id, userId);
            
            // AI 응답 받기
            const aiResponse = await chatService.sendMessage(
                game.thread_id,
                game.assistant_id,
                safeMessage
            );

            // 게임 상태 업데이트
            let updatedGameData = JSON.parse(JSON.stringify(game.game_data));
            
            const parsedState = chatService.parseGameResponse(aiResponse);
            
            if (parsedState) {
                if (parsedState.location && parsedState.location.current) {
                    updatedGameData.location.current = parsedState.location.current;
                    
                    if (parsedState.location.roomId) {
                        updatedGameData.location.roomId = parsedState.location.roomId;
                    }
                    
                    if (!updatedGameData.location.discovered.includes(parsedState.location.current)) {
                        updatedGameData.location.discovered.push(parsedState.location.current);
                    }
                }
                
                if (parsedState.player) {
                    Object.keys(parsedState.player).forEach(key => {
                        if (parsedState.player[key] !== undefined) {
                            updatedGameData.player[key] = parsedState.player[key];
                        }
                    });
                }
                
                if (parsedState.inventory) {
                    Object.keys(parsedState.inventory).forEach(key => {
                        if (parsedState.inventory[key] !== undefined) {
                            updatedGameData.inventory[key] = parsedState.inventory[key];
                        }
                    });
                }
            }

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

    socket.on('get chat history', async (data) => {
        const LOG_HEADER = "SOCKET/CHAT_HISTORY";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");

            const game = await gameService.loadGameForSocket(data.game_id, userId);
            
            let history;
            try {
                history = await chatService.getMessageHistory(game.thread_id);
            } catch (historyError) {
                console.error(`[${LOG_HEADER}] History retrieval error:`, historyError);
                history = [];
            }
            
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
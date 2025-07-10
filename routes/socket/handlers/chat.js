// routes/socket/handlers/chat.js - 수정된 버전

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

            const game = await gameService.loadGameForSocket(data.game_id, userId);
            
            const aiResponse = await chatService.sendMessage(
                game.thread_id,
                game.assistant_id,
                safeMessage
            );

            let updatedGameData = JSON.parse(JSON.stringify(game.game_data));
            
            const parsedState = chatService.parseGameResponse(aiResponse);
            
            if (parsedState) {
                if (parsedState.location && parsedState.location.current) {
                    if (!updatedGameData.location) {
                        updatedGameData.location = {};
                    }
                    
                    updatedGameData.location.current = parsedState.location.current;
                    
                    if (parsedState.location.roomId) {
                        updatedGameData.location.roomId = parsedState.location.roomId;
                    }
                    
                    if (!updatedGameData.location.discovered) {
                        updatedGameData.location.discovered = [];
                    }
                    
                    if (!updatedGameData.location.discovered.includes(parsedState.location.current)) {
                        updatedGameData.location.discovered.push(parsedState.location.current);
                    }
                }
                
                if (parsedState.turn_count) {
                    updatedGameData.turn_count = parsedState.turn_count;
                }
                
                if (parsedState.discoveries && Array.isArray(parsedState.discoveries)) {
                    if (!updatedGameData.discoveries) {
                        updatedGameData.discoveries = [];
                    }
                    
                    parsedState.discoveries.forEach(discovery => {
                        if (!updatedGameData.discoveries.includes(discovery)) {
                            updatedGameData.discoveries.push(discovery);
                        }
                    });
                }
                
                if (parsedState.is_death) {
                    updatedGameData.death_count = (updatedGameData.death_count || 0) + 1;
                    
                    if (parsedState.death_cause) {
                        updatedGameData.last_death_cause = parsedState.death_cause;
                    }
                    
                    console.log(`[${LOG_HEADER}] Death detected - Count increased to: ${updatedGameData.death_count}`);
                    console.log(`[${LOG_HEADER}] Death cause: ${parsedState.death_cause || 'Unknown'}`);
                }
                
                if (!updatedGameData.time_elapsed) {
                    updatedGameData.time_elapsed = 0;
                }
                updatedGameData.time_elapsed += Math.floor(Math.random() * 2) + 2;
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
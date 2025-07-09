// routes/socket/handlers/chat.js - 수정된 버전 (사망 카운터 포함)

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
                // 위치 정보 업데이트 (안전한 방식으로 수정)
                if (parsedState.location && parsedState.location.current) {
                    // location 객체가 없으면 초기화
                    if (!updatedGameData.location) {
                        updatedGameData.location = {};
                    }
                    
                    updatedGameData.location.current = parsedState.location.current;
                    
                    if (parsedState.location.roomId) {
                        updatedGameData.location.roomId = parsedState.location.roomId;
                    }
                    
                    // discovered 배열이 없으면 초기화
                    if (!updatedGameData.location.discovered) {
                        updatedGameData.location.discovered = [];
                    }
                    
                    // 새 위치가 발견 목록에 없으면 추가
                    if (!updatedGameData.location.discovered.includes(parsedState.location.current)) {
                        updatedGameData.location.discovered.push(parsedState.location.current);
                    }
                }
                
                // 턴 수 업데이트
                if (parsedState.turn_count) {
                    updatedGameData.turn_count = parsedState.turn_count;
                }
                
                // 발견 정보 업데이트
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
                
                // 사망 처리 (수정된 부분)
                if (parsedState.is_death) {
                    // 사망 카운트 증가
                    updatedGameData.death_count = (updatedGameData.death_count || 0) + 1;
                    
                    // 사망 원인 기록
                    if (parsedState.death_cause) {
                        updatedGameData.last_death_cause = parsedState.death_cause;
                    }
                    
                    console.log(`[${LOG_HEADER}] Death detected - Count increased to: ${updatedGameData.death_count}`);
                    console.log(`[${LOG_HEADER}] Death cause: ${parsedState.death_cause || 'Unknown'}`);
                }
                
                // 시간 업데이트 (게임 내 시간)
                if (!updatedGameData.time_elapsed) {
                    updatedGameData.time_elapsed = 0;
                }
                // 턴마다 약 2-3분씩 증가한다고 가정
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
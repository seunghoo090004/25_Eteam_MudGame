// routes/socket/handlers/chat.js
//실시간 채팅 메시지 처리 및 이벤트 핸들링


const gameService = require('../services/game');
const chatService = require('../services/chat');

const chatHandler = (io, socket) => {
    socket.on('chat message', async (data) => {
        const LOG_HEADER = "CHAT/MESSAGE";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
            if (!data.game_id) throw "Game ID required";
            if (!data.message) throw "Message required";
    
            // 현재 게임 상태 조회
            const game = await gameService.loadGame(data.game_id, userId);
            
            // AI 응답 받기
            const response = await chatService.sendMessage(
                game.thread_id,
                game.assistant_id,
                data.message
            );
    
            // 게임 상태 업데이트 - 매 응답마다 게임 상태를 갱신
            let updatedGameData = { ...game.game_data };
            
            // 위치 변경 감지
            const locationMatch = response.match(/현재 위치: ([^\n.,]+)/i);
            if (locationMatch && locationMatch[1]) {
                const newLocation = locationMatch[1].trim();
                if (newLocation !== updatedGameData.location.current) {
                    updatedGameData.location.current = newLocation;
                    // 새로운 위치 추가
                    if (!updatedGameData.location.discovered.includes(newLocation)) {
                        updatedGameData.location.discovered.push(newLocation);
                    }
                    console.log(`[${LOG_HEADER}] Player moved to ${newLocation}`);
                }
            }
            
            // 세계관/단계 변경 감지
            const phaseMatch = response.match(/현재 단계: ([^\n.,]+)/i) || 
                                response.match(/세계관: ([^\n.,]+)/i);
            if (phaseMatch && phaseMatch[1]) {
                const newPhase = phaseMatch[1].trim();
                if (newPhase !== updatedGameData.progress.phase) {
                    updatedGameData.progress.phase = newPhase;
                    console.log(`[${LOG_HEADER}] Phase changed to ${newPhase}`);
                }
            }
    
            // 게임 상태가 변경된 경우 저장
            if (JSON.stringify(updatedGameData) !== JSON.stringify(game.game_data)) {
                // 임시 저장 (스레드 변경 없음)
                await chatService.updateGameContext(game.thread_id, updatedGameData);
                console.log(`[${LOG_HEADER}] Game state updated`);
            }
    
            console.log(`[${LOG_HEADER}] Response sent`);
            socket.emit('chat response', {
                success: true,
                response: response,
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
        const LOG_HEADER = "CHAT/HISTORY";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
            if (!data.game_id) throw "Game ID required";

            // 게임 정보 확인
            const game = await gameService.loadGame(data.game_id, userId);
            
            // 채팅 기록 가져오기
            const history = await chatService.getMessageHistory(game.thread_id);
            
            console.log(`[${LOG_HEADER}] History retrieved`);
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
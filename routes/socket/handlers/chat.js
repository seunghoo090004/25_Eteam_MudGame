// routes/socket/handlers/chat.js - 개선된 상태 파싱

const gameService = require('../services/game');
const chatService = require('../services/chat');

const chatHandler = (io, socket) => {
    socket.on('chat message', async (data) => {
        const LOG_HEADER = "CHAT/MESSAGE";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
            if (!data.message) throw new Error("Message required");

            // 메시지 형식 검증
            let safeMessage = data.message;
            if (typeof safeMessage !== 'string') {
                safeMessage = String(safeMessage);
                console.log(`[${LOG_HEADER}] 메시지 형식 변환: ${typeof data.message} -> string`);
            }

            // 현재 게임 상태 조회
            const game = await gameService.loadGame(data.game_id, userId);
            
            // AI 응답 받기
            const response = await chatService.sendMessage(
                game.thread_id,
                game.assistant_id,
                safeMessage
            );

            // 게임 상태 업데이트 (새로운 파싱 방식)
            let updatedGameData = JSON.parse(JSON.stringify(game.game_data)); // 깊은 복사
            
            console.log(`[${LOG_HEADER}] 응답 분석 시작:`, response);
            
            // 새로운 파싱 방식 사용
            const parsedState = chatService.parseGameResponse(response);
            
            if (parsedState) {
                // 위치 정보 업데이트
                if (parsedState.location && parsedState.location.current) {
                    updatedGameData.location.current = parsedState.location.current;
                    
                    if (parsedState.location.roomId) {
                        updatedGameData.location.roomId = parsedState.location.roomId;
                    }
                    
                    // 새로운 위치 추가
                    if (!updatedGameData.location.discovered.includes(parsedState.location.current)) {
                        updatedGameData.location.discovered.push(parsedState.location.current);
                    }
                }
                
                // 플레이어 상태 업데이트
                if (parsedState.player) {
                    if (parsedState.player.health !== undefined) {
                        updatedGameData.player.health = parsedState.player.health;
                    }
                    if (parsedState.player.maxHealth !== undefined) {
                        updatedGameData.player.maxHealth = parsedState.player.maxHealth;
                    }
                    if (parsedState.player.status) {
                        updatedGameData.player.status = parsedState.player.status;
                    }
                    if (parsedState.player.mental) {
                        updatedGameData.player.mental = parsedState.player.mental;
                    }
                }
                
                // 인벤토리 업데이트
                if (parsedState.inventory) {
                    if (parsedState.inventory.keyItems) {
                        updatedGameData.inventory.keyItems = parsedState.inventory.keyItems;
                    }
                    if (parsedState.inventory.gold !== undefined) {
                        updatedGameData.inventory.gold = parsedState.inventory.gold;
                    }
                }
                
                console.log(`[${LOG_HEADER}] 게임 상태 업데이트 완료`);
            }

            // 게임 상태가 변경된 경우 컨텍스트 업데이트 (빈 함수로 처리)
            const isDataChanged = JSON.stringify(updatedGameData) !== JSON.stringify(game.game_data);
            
            if (isDataChanged) {
                console.log(`[${LOG_HEADER}] 게임 상태가 변경됨`);
                
                try {
                    await chatService.updateGameContext(game.thread_id, updatedGameData);
                } catch (contextError) {
                    console.error(`[${LOG_HEADER}] 컨텍스트 업데이트 오류:`, contextError);
                    // 오류가 발생해도 계속 진행
                }
            }

            console.log(`[${LOG_HEADER}] 응답 전송`);
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
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");

            // 게임 정보 확인
            const game = await gameService.loadGame(data.game_id, userId);
            
            // 채팅 기록 가져오기
            let history;
            try {
                history = await chatService.getMessageHistory(game.thread_id);
            } catch (historyError) {
                console.error(`[${LOG_HEADER}] History retrieval error:`, historyError);
                history = []; // 오류 시 빈 배열 반환
            }
            
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
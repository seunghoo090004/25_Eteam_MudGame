// routes/socket/handlers/chat.js - 텍스트 분석 및 위치 업데이트 개선

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

            // 게임 상태 업데이트
            let updatedGameData = JSON.parse(JSON.stringify(game.game_data)); // 깊은 복사
            
            console.log(`[${LOG_HEADER}] 응답 분석 시작:`, response);
            
            // 응답 텍스트에서 현재 위치 정보 분석
            // 다양한 패턴으로 위치 정보를 찾음
            let locationFound = false;
            
            // 패턴 1: "현재 위치: 장소명"
            const locationPattern1 = /현재\s*위치\s*:\s*([^.,\n]+)/i;
            const locationMatch1 = response.match(locationPattern1);
            
            // 패턴 2: "당신은 지금 장소명에 있습니다"
            const locationPattern2 = /당신은\s*지금\s*([^.,\n에서]+)(?:에|에서)\s*있/;
            const locationMatch2 = response.match(locationPattern2);
            
            // 패턴 3: "장소명에 도착했습니다"
            const locationPattern3 = /([^.,\n에서]+)(?:에|에서)\s*도착했/;
            const locationMatch3 = response.match(locationPattern3);
            
            let newLocation = null;
            
            if (locationMatch1) {
                newLocation = locationMatch1[1].trim();
                locationFound = true;
                console.log(`[${LOG_HEADER}] 패턴1로 위치 감지: ${newLocation}`);
            } else if (locationMatch2) {
                newLocation = locationMatch2[1].trim();
                locationFound = true;
                console.log(`[${LOG_HEADER}] 패턴2로 위치 감지: ${newLocation}`);
            } else if (locationMatch3) {
                newLocation = locationMatch3[1].trim();
                locationFound = true;
                console.log(`[${LOG_HEADER}] 패턴3로 위치 감지: ${newLocation}`);
            }
            
            // 세계관 정보 찾기
            // 패턴: "현재 세계관: 세계관명" 또는 "세계관: 세계관명"
            const worldPattern = /(?:현재\s*세계관|세계관)\s*:\s*([^.,\n]+)/i;
            const worldMatch = response.match(worldPattern);
            
            let worldUpdated = false;
            if (worldMatch) {
                const newWorld = worldMatch[1].trim();
                console.log(`[${LOG_HEADER}] 세계관 감지: ${newWorld}`);
                
                if (newWorld !== updatedGameData.progress.phase) {
                    updatedGameData.progress.phase = newWorld;
                    worldUpdated = true;
                }
            }
            
            // 위치 업데이트
            if (locationFound && newLocation) {
                // 유효한 위치 이름인지 간단히 검증 (너무 긴 텍스트는 제외)
                if (newLocation.length > 0 && newLocation.length < 30) {
                    if (newLocation !== updatedGameData.location.current) {
                        console.log(`[${LOG_HEADER}] 위치 업데이트: ${updatedGameData.location.current} -> ${newLocation}`);
                        updatedGameData.location.current = newLocation;
                        
                        // 새로운 위치 추가
                        if (!updatedGameData.location.discovered.includes(newLocation)) {
                            updatedGameData.location.discovered.push(newLocation);
                        }
                    }
                } else {
                    console.log(`[${LOG_HEADER}] 감지된 위치가 유효하지 않음: ${newLocation}`);
                }
            }

            // 게임 상태가 변경된 경우
            const isDataChanged = JSON.stringify(updatedGameData) !== JSON.stringify(game.game_data);
            
            if (isDataChanged) {
                console.log(`[${LOG_HEADER}] 게임 상태가 변경됨`);
                
                // 상태 업데이트
                gameData = updatedGameData;
                
                // 컨텍스트 업데이트
                await chatService.updateGameContext(game.thread_id, updatedGameData);
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
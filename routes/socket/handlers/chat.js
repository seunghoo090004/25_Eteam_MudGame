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
            // 이 부분을 개선하여 실제 게임 상태를 추적하고 업데이트합니다
            let updatedGameData = { ...game.game_data };
            
            // 응답 분석을 통한 게임 상태 업데이트 (예시: 새로운 위치, 아이템 획득 등)
            // 이 부분은 실제 게임 로직에 맞게 수정해야 합니다
            
            // 예: 레벨업 감지
            if (response.includes("레벨업") || response.includes("레벨 업")) {
                updatedGameData.player.level += 1;
                console.log(`[${LOG_HEADER}] Player leveled up to ${updatedGameData.player.level}`);
            }
            
            // 예: 위치 변경 감지
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
            
            // 예: 골드 변경 감지
            const goldMatch = response.match(/(\d+)\s*골드를\s*(획득|얻었|찾았|주웠)/i);
            if (goldMatch) {
                const goldAmount = parseInt(goldMatch[1]);
                updatedGameData.inventory.gold += goldAmount;
                console.log(`[${LOG_HEADER}] Player gained ${goldAmount} gold, now has ${updatedGameData.inventory.gold}`);
            }
            
            // 예: 아이템 획득 감지
            const itemMatch = response.match(/아이템\s*획득: ([^\n.,]+)/i);
            if (itemMatch && itemMatch[1]) {
                const newItem = itemMatch[1].trim();
                updatedGameData.inventory.items.push(newItem);
                console.log(`[${LOG_HEADER}] Player gained item: ${newItem}`);
            }
            
            // 예: 체력 변화 감지
            const healthMatch = response.match(/체력: (\d+)\/100/i);
            if (healthMatch && healthMatch[1]) {
                updatedGameData.player.health = parseInt(healthMatch[1]);
                console.log(`[${LOG_HEADER}] Player health changed to ${updatedGameData.player.health}`);
            }

            // 게임 상태가 변경된 경우 저장
            if (JSON.stringify(updatedGameData) !== JSON.stringify(game.game_data)) {
                // 게임 상태 업데이트는 하지만 스레드 변경은 하지 않음 (임시 저장)
                // 'save game' 이벤트 발생 시 실제 저장이 이루어집니다
                await gameService.saveGame(data.game_id, userId, updatedGameData);
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
// routes/socket/handlers/chat.js - 텍스트 분석 및 위치 업데이트 개선

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
               // 문자열이 아닌 경우 안전하게 변환
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

           // 게임 상태 업데이트
           let updatedGameData = JSON.parse(JSON.stringify(game.game_data)); // 깊은 복사
           
           console.log(`[${LOG_HEADER}] 응답 분석 시작:`, response);
           
           // 응답 텍스트에서 위치 정보 분석
           const locationPattern = /\[위치:\s*([^|]+)\|([^\]]+)\]/;
           const locationMatch = response.match(locationPattern);
           
           if (locationMatch) {
               const roomId = locationMatch[1].trim();
               const roomName = locationMatch[2].trim();
               console.log(`[${LOG_HEADER}] 위치 감지: ${roomId}|${roomName}`);
               
               updatedGameData.location.roomId = roomId;
               updatedGameData.location.roomName = roomName;
               updatedGameData.location.current = roomName;
               
               // 새로운 위치 추가
               if (!updatedGameData.location.discovered.includes(roomName)) {
                   updatedGameData.location.discovered.push(roomName);
               }
           }
           
           // 상태 정보 추출
           const statusPattern = /\[상태:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/;
           const statusMatch = response.match(statusPattern);
           
           if (statusMatch) {
               const health = parseInt(statusMatch[1]);
               const items = statusMatch[2].trim();
               const effects = statusMatch[3].trim();
               const discoveries = statusMatch[4].trim();
               
               console.log(`[${LOG_HEADER}] 상태 감지: 체력=${health}%, 아이템=${items}, 효과=${effects}, 발견=${discoveries}`);
               
               updatedGameData.player.health = health;
               updatedGameData.player.effects = effects;
               updatedGameData.inventory.keyItems = items;
               updatedGameData.progress.discoveries = discoveries;
           }

           // 게임 상태가 변경된 경우
           const isDataChanged = JSON.stringify(updatedGameData) !== JSON.stringify(game.game_data);
           
           if (isDataChanged) {
               console.log(`[${LOG_HEADER}] 게임 상태가 변경됨`);
               
               // 컨텍스트 업데이트
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
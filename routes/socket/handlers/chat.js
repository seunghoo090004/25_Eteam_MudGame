// routes/socket/handlers/chat.js - 엔딩 처리 추가 버전

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
            
            // ✅ 새로 추가: 턴 증가
            if (!game.game_data.progress) {
                game.game_data.progress = {};
            }
            game.game_data.progress.turnCount = (game.game_data.progress.turnCount || 0) + 1;
            game.game_data.progress.escapePhase = game.game_data.progress.turnCount >= 11;
            
            console.log(`${LOG_HEADER} Turn ${game.game_data.progress.turnCount} - Escape phase: ${game.game_data.progress.escapePhase}`);
            
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

            // ✅ 새로 추가: 엔딩 조건 체크
            const endingCondition = checkEndingConditions(updatedGameData, aiResponse);
            
            if (endingCondition) {
                console.log(`${LOG_HEADER} Ending detected:`, endingCondition);
                
                // 엔딩 데이터와 함께 응답
                socket.emit('game ending', {
                    success: true,
                    ending: endingCondition,
                    final_response: aiResponse,
                    final_game_state: updatedGameData
                });
                return;
            }

            // 일반 응답
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

// ✅ 새로 추가: 엔딩 조건 체크 함수
function checkEndingConditions(gameData, aiResponse) {
    if (!gameData || !gameData.progress) return null;
    
    // 사망 체크
    if (gameData.player && gameData.player.health <= 0) {
        return {
            type: 'death',
            turnCount: gameData.progress.turnCount || 0,
            deathCount: (gameData.progress.deathCount || 0) + 1,
            cause: extractDeathCause(aiResponse),
            message: '당신은 죽었습니다.'
        };
    }
    
    // 탈출 체크 (11턴 이후)
    if (gameData.progress.turnCount >= 11 && aiResponse) {
        const escapeKeywords = [
            '탈출구', '출구', '자유', '탈출 성공', '던전을 벗어나',
            '밖으로 나가', '해방', '구원', '탈출하다', '벗어나다'
        ];
        
        const hasEscapeKeyword = escapeKeywords.some(keyword => 
            aiResponse.includes(keyword)
        );
        
        if (hasEscapeKeyword) {
            return {
                type: 'escape',
                turnCount: gameData.progress.turnCount,
                deathCount: gameData.progress.deathCount || 0,
                escapeMethod: extractEscapeMethod(aiResponse),
                message: '축하합니다! 던전에서 탈출했습니다!'
            };
        }
    }
    
    // 특별 엔딩 체크 (보스 처치, 비밀 발견 등)
    if (aiResponse && gameData.progress.turnCount >= 15) {
        const specialKeywords = ['보스를 물리쳤', '비밀을 발견', '던전의 주인'];
        const hasSpecialKeyword = specialKeywords.some(keyword => 
            aiResponse.includes(keyword)
        );
        
        if (hasSpecialKeyword) {
            return {
                type: 'special',
                turnCount: gameData.progress.turnCount,
                deathCount: gameData.progress.deathCount || 0,
                achievement: extractAchievement(aiResponse),
                message: '특별한 결말을 달성했습니다!'
            };
        }
    }
    
    return null;
}

// ✅ 새로 추가: 사망 원인 추출
function extractDeathCause(response) {
    if (!response) return '알 수 없는 원인';
    
    const deathCauses = {
        '함정': ['함정', '가시', '독침', '화살'],
        '추락': ['떨어', '추락', '낭떠러지', '구멍'],
        '독': ['독', '중독', '독가스'],
        '화상': ['불', '화염', '용암', '타죽'],
        '압사': ['눌려', '짓밟', '압사'],
        '질식': ['숨', '질식', '산소'],
        '출혈': ['피', '출혈', '상처']
    };
    
    for (const [cause, keywords] of Object.entries(deathCauses)) {
        if (keywords.some(keyword => response.includes(keyword))) {
            return cause;
        }
    }
    
    return '전투 중 사망';
}

// ✅ 새로 추가: 탈출 방법 추출
function extractEscapeMethod(response) {
    if (!response) return '일반적인 탈출';
    
    const escapeMethods = {
        '지혜로운 탈출': ['퍼즐', '수수께끼', '지혜'],
        '용감한 탈출': ['싸움', '전투', '용기'],
        '비밀 통로': ['비밀', '숨겨진', '통로'],
        '마법적 탈출': ['마법', '주문', '텔레포트']
    };
    
    for (const [method, keywords] of Object.entries(escapeMethods)) {
        if (keywords.some(keyword => response.includes(keyword))) {
            return method;
        }
    }
    
    return '일반적인 탈출';
}

// ✅ 새로 추가: 특별 업적 추출
function extractAchievement(response) {
    if (!response) return '특별한 발견';
    
    if (response.includes('보스')) return '던전 지배자 처치';
    if (response.includes('비밀')) return '고대의 비밀 발견';
    if (response.includes('보물')) return '전설의 보물 획득';
    
    return '숨겨진 진실 발견';
}

module.exports = chatHandler;s
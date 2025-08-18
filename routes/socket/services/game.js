// routes/socket/services/game.js - 로그라이크 버전

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class GameService {
    
    // Socket용 게임 로드
    async loadGameForSocket(gameId, userId) {
        const LOG_HEADER = "SOCKET_GAME_SERVICE/LOAD";
        
        try {
            const connection = await pool.getConnection();
            try {
                const [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (games.length === 0) {
                    throw new Error("Game not found");
                }

                const gameData = games[0];
                
                if (!gameData.thread_id) {
                    throw new Error("Invalid thread ID");
                }
                
                // 메시지 히스토리 가져오기
                let chatHistory = [];
                try {
                    const messages = await openai.beta.threads.messages.list(gameData.thread_id);
                    chatHistory = messages.data
                        .filter(msg => {
                            const content = msg.content[0]?.text?.value || '';
                            return !content.includes('[로그라이크 게임 마스터 지침]') &&
                                   !content.includes('[시스템 내부') &&
                                   !content.includes('선택:') &&
                                   msg.role === 'assistant';
                        })
                        .map(msg => ({
                            role: msg.role,
                            content: msg.content[0].text.value,
                            created_at: new Date(msg.created_at * 1000)
                        }));
                } catch (messageError) {
                    console.error(`${LOG_HEADER} Error fetching messages:`, messageError);
                    chatHistory = [];
                }

                // 로그라이크 게임 데이터 파싱
                let parsedGameData = this.normalizeGameData(gameData.game_data);
                
                console.log(`[${LOG_HEADER}] Game loaded for socket: ${gameId}`);
                return {
                    ...gameData,
                    game_data: parsedGameData,
                    chatHistory
                };

            } finally {
                connection.release();
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    // 로그라이크 게임 데이터 정규화
    normalizeGameData(gameData) {
        let gameDataObj;
        
        try {
            gameDataObj = typeof gameData === 'string' 
                ? JSON.parse(gameData) 
                : gameData;
        } catch (err) {
            console.error("Game data parsing error:", err);
            gameDataObj = this.getDefaultGameData();
        }
        
        // 로그라이크 필수 구조 보장
        gameDataObj.turn_count = gameDataObj.turn_count || 1;
        gameDataObj.death_count = gameDataObj.death_count || 0;
        gameDataObj.game_mode = gameDataObj.game_mode || 'roguelike';
        
        gameDataObj.location = gameDataObj.location || {};
        gameDataObj.location.current = gameDataObj.location.current || "던전 입구";
        gameDataObj.location.roomId = gameDataObj.location.roomId || "001";
        
        gameDataObj.discoveries = gameDataObj.discoveries || [];
        
        gameDataObj.progress = gameDataObj.progress || {};
        gameDataObj.progress.phase = gameDataObj.progress.phase || "시작";
        gameDataObj.progress.last_action = gameDataObj.progress.last_action || "게임 시작";
        
        return gameDataObj;
    }
    
    // 로그라이크 기본 데이터
    getDefaultGameData() {
        return {
            turn_count: 1,
            death_count: 0,
            game_mode: "roguelike",
            location: {
                roomId: "001",
                current: "던전 입구"
            },
            discoveries: [],
            progress: {
                phase: "시작",
                last_action: "게임 시작"
            }
        };
    }

    // 엔딩 조건 체크
    checkEndingConditions(gameData, aiResponse) {
        const LOG_HEADER = "GAME_SERVICE/CHECK_ENDING";
        
        try {
            // 사망 체크
            if (aiResponse.includes("당신은 죽었습니다") || aiResponse.includes("죽었습니다")) {
                console.log(`[${LOG_HEADER}] Death detected`);
                
                // 사망 원인 추출
                let deathCause = "알 수 없는 원인";
                const deathMatch = aiResponse.match(/원인[:\s]*([^.\n]+)/i) || 
                                aiResponse.match(/당신은 ([^.]+)로 인해 죽었습니다/i) ||
                                aiResponse.match(/([^.\n]+)로 인해 죽었습니다/i);
                if (deathMatch) {
                    deathCause = deathMatch[1].trim();
                }
                
                return {
                    type: 'death',
                    cause: deathCause,
                    story: this.generateDeathStory(gameData, deathCause)
                };
            }
            
            // 탈출 체크 (11턴 이후)
            if (gameData.turn_count >= 11) {
                const escapeKeywords = ['탈출', '출구', '자유', '밖으로', '빛이 보인다', '성공'];
                const hasEscapeKeyword = escapeKeywords.some(keyword => 
                    aiResponse.includes(keyword)
                );
                
                if (hasEscapeKeyword) {
                    console.log(`[${LOG_HEADER}] Escape detected`);
                    return {
                        type: 'escape',
                        cause: null,
                        story: this.generateEscapeStory(gameData)
                    };
                }
            }
            
            return null;
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            return null;
        }
    }

    // 사망 스토리 생성
    generateDeathStory(gameData, deathCause) {
        const turn = gameData.turn_count || 1;
        const deaths = gameData.death_count || 0;
        const discoveries = (gameData.discoveries || []).length;
        
        let story = `던전의 어둠 속에서 ${turn}턴 만에 생을 마감했습니다.\n\n`;
        story += `사망 원인: ${deathCause}\n`;
        story += `총 사망 횟수: ${deaths + 1}회\n`;
        story += `발견한 정보: ${discoveries}개\n\n`;
        
        if (turn <= 3) {
            story += "초반 함정에 걸려 빠른 죽음을 맞이했습니다. 더 신중한 접근이 필요했을 것입니다.";
        } else if (turn <= 8) {
            story += "중반까지 진행했지만 위험을 극복하지 못했습니다. 경험을 살려 다시 도전해보세요.";
        } else if (turn <= 13) {
            story += "후반까지 생존했지만 최고 난이도를 넘지 못했습니다. 놀라운 생존력을 보였습니다.";
        } else {
            story += "탈출 구간에서 사망했습니다. 거의 성공에 가까웠던 안타까운 결과입니다.";
        }
        
        return story;
    }

    // 탈출 스토리 생성
    generateEscapeStory(gameData) {
        const turn = gameData.turn_count || 1;
        const deaths = gameData.death_count || 0;
        const discoveries = (gameData.discoveries || []).length;
        
        let story = `축하합니다! ${turn}턴 만에 불가능한 던전 탈출에 성공했습니다!\n\n`;
        story += `최종 턴: ${turn}턴\n`;
        story += `총 사망 횟수: ${deaths}회\n`;
        story += `발견한 정보: ${discoveries}개\n\n`;
        
        if (deaths === 0) {
            story += "한 번도 죽지 않고 탈출한 완벽한 플레이! 전설적인 모험가입니다.";
        } else if (deaths <= 2) {
            story += "최소한의 희생으로 탈출에 성공했습니다. 뛰어난 적응력을 보였습니다.";
        } else if (deaths <= 5) {
            story += "여러 시행착오를 거쳐 탈출했습니다. 포기하지 않는 의지가 승리를 가져왔습니다.";
        } else {
            story += "수많은 죽음을 딛고 마침내 탈출했습니다. 불굴의 정신력이 빛난 결과입니다.";
        }
        
        return story;
    }

    // 턴 증가 및 위험도 체크
    incrementTurn(gameData) {
        gameData.turn_count = (gameData.turn_count || 1) + 1;
        
        // 16턴 시스템 단계별 위험도 로그
        const turn = gameData.turn_count;
        let stageInfo = "";
        
        if (turn >= 1 && turn <= 3) {
            stageInfo = "초급 단계 - 50% 생존율 (생존 선택지 2개)";
        } else if (turn >= 4 && turn <= 7) {
            stageInfo = "중급 단계 - 25% 생존율 (생존 선택지 1개)";
        } else if (turn >= 8 && turn <= 12) {
            stageInfo = "고급 단계 - 25% 생존율 (생존 선택지 1개)";
        } else if (turn >= 13 && turn <= 16) {
            stageInfo = "최종 단계 - 75% 생존율 (생존 선택지 3개)";
        } else if (turn > 16) {
            stageInfo = "탈출 기회 단계 - 탈출 루트 제공";
        } else {
            stageInfo = "알 수 없는 단계";
        }
        
        console.log(`Turn ${turn} - ${stageInfo}`);
        
        return gameData;
    }
}

module.exports = new GameService();
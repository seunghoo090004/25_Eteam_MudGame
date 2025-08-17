// routes/socket/services/game.js - 업데이트된 버전

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class GameService {
    
    // 난이도 시스템 - 점진적 구조
    getTurnDifficulty(turn) {
        if (turn <= 3) {
            return { 
                survivalRate: 0.5, 
                survivingChoices: 2,
                stage: 'beginner',
                description: '초급 단계'
            };
        }
        if (turn <= 7) {
            return { 
                survivalRate: 0.25, 
                survivingChoices: 1,
                stage: 'intermediate', 
                description: '중급 단계'
            };
        }
        if (turn <= 12) {
            return { 
                survivalRate: 0.25, 
                survivingChoices: 1,
                stage: 'advanced',
                description: '고급 단계'
            };
        }
        return { 
            survivalRate: 0.75, 
            survivingChoices: 3,
            stage: 'final',
            description: '최종 단계 (탈출 가능)'
        };
    }

    // 몬스터 조우 확률
    getMonsterEncounterRate(turn) {
        if (turn <= 3) return 0.3;  // 30%
        if (turn <= 6) return 0.5;  // 50%
        if (turn <= 10) return 0.7; // 70%
        return 0.5; // 탈출 시도 시
    }

    // 몬스터 타입 결정
    getMonsterType(turn) {
        const monsters = {
            beginner: ['고블린', '스켈레톤', '슬라임'],
            intermediate: ['오크', '트롤', '미노타우로스'], 
            advanced: ['리치', '데몬', '뱀파이어'],
            final: ['드래곤']
        };

        const difficulty = this.getTurnDifficulty(turn);
        const stageMonsters = monsters[difficulty.stage] || monsters.beginner;
        return stageMonsters[Math.floor(Math.random() * stageMonsters.length)];
    }

    // Socket용 게임 로드 (기존 함수 유지)
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

                // 게임 데이터 정규화
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

    // 게임 데이터 정규화 (기존 호환성 유지)
    normalizeGameData(gameData) {
        let gameDataObj;
        
        try {
            gameDataObj = typeof gameData === 'string' 
                ? JSON.parse(gameData) 
                : gameData;
        } catch (e) {
            console.error('Error parsing game data:', e);
            return this.getDefaultGameData();
        }

        // 새 구조로 정규화하되 기존 데이터 보존
        const normalized = {
            // 기존 필드들 유지
            ...gameDataObj,
            
            // 새 필드들 추가 (기존 값이 없을 때만)
            turn_count: gameDataObj.turn_count || 1,
            death_count: gameDataObj.death_count || 0,
            discoveries: gameDataObj.discoveries || [],
            game_mode: gameDataObj.game_mode || 'roguelike',
            
            // 위치 정보 정규화
            location: {
                current: gameDataObj.location?.current || '차원의 감옥 최하층',
                roomId: gameDataObj.location?.roomId || '001',
                discovered: gameDataObj.location?.discovered || [],
                ...gameDataObj.location
            },
            
            // 진행 상황 정규화
            progress: {
                phase: gameDataObj.progress?.phase || '시작',
                last_action: gameDataObj.progress?.last_action || '게임 시작',
                ...gameDataObj.progress
            }
        };

        return normalized;
    }

    // 기본 게임 데이터
    getDefaultGameData() {
        return {
            turn_count: 1,
            death_count: 0,
            discoveries: [],
            game_mode: 'roguelike',
            location: {
                current: '차원의 감옥 최하층',
                roomId: '001',
                discovered: []
            },
            progress: {
                phase: '시작',
                last_action: '게임 시작'
            }
        };
    }

    // 사망 스토리 생성
    generateDeathStory(gameData) {
        const turn = gameData.turn_count || 1;
        const deaths = gameData.death_count || 0;
        const discoveries = (gameData.discoveries || []).length;
        
        let story = `차원의 감옥 어둠 속에서 ${turn}턴 만에 생을 마감했습니다.\n\n`;
        story += `사망 원인: ${gameData.cause_of_death || '알 수 없는 원인'}\n`;
        story += `이 사망 횟수: ${deaths + 1}회\n`;
        story += `발견한 정보: ${discoveries}개\n\n`;
        
        if (turn <= 3) {
            story += "초반 함정에 걸려 빠른 죽음을 맞이했습니다.";
        } else if (turn <= 7) {
            story += "중반까지 진행했지만 위험을 극복하지 못했습니다.";
        } else if (turn <= 12) {
            story += "고급 단계까지 도달한 놀라운 생존력을 보였습니다.";
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
        
        let story = `축하합니다! ${turn}턴 만에 불가능한 차원의 감옥 탈출에 성공했습니다!\n\n`;
        story += `최종 턴: ${turn}턴\n`;
        story += `이 사망 횟수: ${deaths}회\n`;
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
        
        // 턴별 위험도 로그
        const turn = gameData.turn_count;
        const difficulty = this.getTurnDifficulty(turn);
        
        console.log(`Turn ${turn} - Stage: ${difficulty.description}, Survival Rate: ${difficulty.survivalRate * 100}%`);
        
        return gameData;
    }

    // 엔딩 조건 체크 (16턴으로 확장)
    checkEndingConditions(gameData, response) {
        if (!response || !gameData) return null;
        
        // 사망 체크
        if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
            let deathCause = "알 수 없는 원인";
            const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                            response.match(/([^.\n]+)로 인해 죽었습니다/i);
            if (deathMatch) {
                deathCause = deathMatch[1].trim();
            }
            
            return {
                type: 'death',
                cause: deathCause,
                final_turn: gameData.turn_count || 1,
                total_deaths: (gameData.death_count || 0) + 1,
                discoveries: gameData.discoveries || [],
                discoveries_count: (gameData.discoveries || []).length
            };
        }
        
        // 탈출 체크 (16턴 이후)
        if (gameData.turn_count >= 16) {
            const escapeKeywords = ['탈출', '출구', '자유', '밖으로', '빛이 보인다', '성공적으로'];
            const hasEscapeKeyword = escapeKeywords.some(keyword => 
                response.includes(keyword)
            );
            
            if (hasEscapeKeyword) {
                return {
                    type: 'escape',
                    cause: null,
                    final_turn: gameData.turn_count || 1,
                    total_deaths: gameData.death_count || 0,
                    discoveries: gameData.discoveries || [],
                    discoveries_count: (gameData.discoveries || []).length
                };
            }
        }
        
        return null;
    }
}

module.exports = new GameService();
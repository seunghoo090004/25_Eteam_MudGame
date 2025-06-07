// routes/socket/services/game.js - 진행률 제거된 최종 버전

const pool = require('../../../config/database');
const openai = require('../../../config/openai');
const { v4: uuidv4 } = require('uuid');

class GameService {
    
    // ============================================================================
    // 유틸리티 함수들
    // ============================================================================
    
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
        
        // 기본 구조 보장
        gameDataObj.player = gameDataObj.player || {};
        gameDataObj.player.health = gameDataObj.player.health || 100;
        gameDataObj.player.maxHealth = gameDataObj.player.maxHealth || 100;
        gameDataObj.player.status = gameDataObj.player.status || '양호';
        gameDataObj.player.mental = gameDataObj.player.mental || '안정';
        
        gameDataObj.location = gameDataObj.location || {};
        gameDataObj.location.current = gameDataObj.location.current || "알 수 없는 곳";
        gameDataObj.location.roomId = gameDataObj.location.roomId || "001";
        
        gameDataObj.inventory = gameDataObj.inventory || {};
        gameDataObj.inventory.items = gameDataObj.inventory.items || [];
        gameDataObj.inventory.gold = gameDataObj.inventory.gold || 0;
        gameDataObj.inventory.keyItems = gameDataObj.inventory.keyItems || '없음';
        
        gameDataObj.progress = gameDataObj.progress || {};
        gameDataObj.progress.playTime = gameDataObj.progress.playTime || "방금 시작";
        gameDataObj.progress.deathCount = gameDataObj.progress.deathCount || 0;
        
        return gameDataObj;
    }
    
    getDefaultGameData() {
        return {
            player: {
                name: "플레이어",
                level: 1,
                health: 100,
                maxHealth: 100,
                status: '양호',
                mental: '안정'
            },
            location: {
                roomId: "001",
                current: "시작 지점",
                discovered: ["시작 지점"]
            },
            inventory: {
                items: [],
                gold: 0,
                keyItems: '없음'
            },
            progress: {
                playTime: "방금 시작",
                deathCount: 0,
                phase: "튜토리얼"
            }
        };
    }
    
    formatPlayTime(minutes) {
        if (minutes < 1) return "방금 시작";
        if (minutes < 60) return `${minutes}분`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
    }

    // 게임 상태 텍스트 생성 (진행률 제거)
    generateStatusText(gameData) {
        const health = gameData.player?.health || 100;
        const deathCount = gameData.progress?.deathCount || 0;
        
        if (health <= 20) return '위험 상태!';
        if (deathCount > 5) return `사망 ${deathCount}회`;
        if (health <= 50) return '주의 필요';
        return '안정';
    }

    // 게임 상태 아이콘 생성
    generateStatusIcon(gameData) {
        const health = gameData.player?.health || 100;
        
        if (health <= 20) return '🔥';
        if (health <= 50) return '⚠️';
        return '✅';
    }

    // 위치 정보 추출 (새로운 형식 지원)
    extractLocationFromResponse(response) {
        // >> 위치: [ID] - [방이름] 형식에서 추출
        const locationPattern = />>\s*위치:\s*([^-]+)\s*-\s*([^\n]+)/;
        const match = response.match(locationPattern);
        
        if (match) {
            return {
                roomId: match[1].trim(),
                roomName: match[2].trim()
            };
        }
        
        return null;
    }

    //============================================================================================
    async createNewGame(userId, assistantId) {
    //============================================================================================
        const LOG_HEADER = "GAME_SERVICE/CREATE_NEW";
        
        try {
            const thread = await openai.beta.threads.create();
            const gameId = uuidv4();
            
            const initialGameData = {
                player: {
                    name: "플레이어",
                    level: 1,
                    exp: 0,
                    health: 100,
                    maxHealth: 100,
                    effects: '없음',
                    mental: '안정',
                    status: '양호'
                },
                location: {
                    roomId: '001',
                    roomName: '던전 최하층 감옥',
                    level: 1,
                    maxLevel: 5,
                    current: "던전 최하층 감옥",
                    discovered: ["던전 최하층 감옥"]
                },
                inventory: {
                    keyItems: '횃불(2)',
                    items: ['횃불(2)'],
                    gold: 0
                },
                progress: {
                    deathCount: 0,
                    discoveries: '없음',
                    puzzlesSolved: 0,
                    phase: "탈출",
                    playTime: "방금 시작",
                    lastAction: "게임 시작",
                    flags: {
                        tutorialComplete: false,
                        metNPC: false
                    }
                }
            };
            
            const connection = await pool.getConnection();
            try {
                await connection.query(
                    `INSERT INTO game_state 
                    (game_id, user_id, thread_id, assistant_id, game_data, created_at, last_updated) 
                    VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                    [gameId, userId, thread.id, assistantId, JSON.stringify(initialGameData)]
                );

                console.log(`[${LOG_HEADER}] New game created: ${gameId}`);
                return {
                    gameId,
                    threadId: thread.id,
                    gameData: initialGameData
                };

            } finally {
                connection.release();
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    //============================================================================================
    async loadGame(gameId, userId) {
    //============================================================================================
        const LOG_HEADER = "GAME_SERVICE/LOAD";
        
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
                
                // 메시지 히스토리 안전하게 가져오기
                let chatHistory;
                try {
                    const messages = await openai.beta.threads.messages.list(gameData.thread_id);
                    chatHistory = messages.data.map(msg => {
                        let content = "메시지 내용을 불러올 수 없습니다.";
                        try {
                            if (msg.content && msg.content.length > 0 && msg.content[0].text) {
                                content = msg.content[0].text.value;
                            }
                        } catch (contentError) {
                            console.error(`${LOG_HEADER} Message content error:`, contentError);
                        }
                        
                        return {
                            role: msg.role,
                            content: content,
                            created_at: new Date(msg.created_at * 1000)
                        };
                    });
                } catch (messageError) {
                    console.error(`${LOG_HEADER} Error fetching messages:`, messageError);
                    chatHistory = [];
                }

                // 게임 데이터 파싱 및 개선
                let parsedGameData = this.normalizeGameData(gameData.game_data);
                
                // 플레이 시간 업데이트
                const now = new Date();
                const created = new Date(gameData.created_at);
                const playTimeMinutes = Math.floor((now - created) / (1000 * 60));
                parsedGameData.progress.playTime = this.formatPlayTime(playTimeMinutes);
                
                console.log(`[${LOG_HEADER}] Game loaded: ${gameId}`);
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

    //============================================================================================
    async saveGame(gameId, userId, gameData) {
    //============================================================================================
        const LOG_HEADER = "GAME_SERVICE/SAVE";
        
        try {
            const connection = await pool.getConnection();
            try {
                // 기존 게임 정보 로드
                const [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );
                
                if (games.length === 0) {
                    throw new Error("Game not found or unauthorized");
                }
                
                const game = games[0];
                const oldThreadId = game.thread_id;
                
                // 게임 데이터 정규화
                let gameDataObj = this.normalizeGameData(gameData);
                
                // 플레이 시간 계산
                const now = new Date();
                const created = new Date(game.created_at);
                const playTimeMinutes = Math.floor((now - created) / (1000 * 60));
                gameDataObj.progress.playTime = this.formatPlayTime(playTimeMinutes);
                
                // AI 요약 생성 및 새 스레드 생성
                const chatService = require('./chat');
                let summary, newThreadId, initialResponse;
                
                try {
                    summary = await chatService.createGameSummary(oldThreadId, game.assistant_id);
                    
                    const newThread = await openai.beta.threads.create();
                    newThreadId = newThread.id;
                    
                    // 요약을 새 스레드에 전달
                    await openai.beta.threads.messages.create(newThreadId, {
                        role: "user",
                        content: `이전 게임 요약: ${summary}\n\n계속 진행해주세요.`
                    });
                    
                    // 초기 응답 생성
                    const run = await openai.beta.threads.runs.create(newThreadId, {
                        assistant_id: game.assistant_id
                    });
                    
                    // 실행 완료 대기
                    let runStatus;
                    do {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        runStatus = await openai.beta.threads.runs.retrieve(newThreadId, run.id);
                    } while (['queued', 'in_progress'].includes(runStatus.status));
                    
                    if (runStatus.status === 'completed') {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const messages = await openai.beta.threads.messages.list(newThreadId);
                        
                        if (messages.data && messages.data.length > 0 && 
                            messages.data[0].content && messages.data[0].content[0] && 
                            messages.data[0].content[0].text) {
                            initialResponse = messages.data[0].content[0].text.value;
                        }
                    }
                    
                } catch (summaryError) {
                    console.error(`${LOG_HEADER} Summary error:`, summaryError);
                    // 오류 시 기본값 사용
                    const newThread = await openai.beta.threads.create();
                    newThreadId = newThread.id;
                    summary = "게임이 저장되었습니다.";
                    initialResponse = "게임을 이어서 진행합니다.";
                }
                
                // 게임 데이터 저장
                const gameDataToSave = JSON.stringify(gameDataObj);
                
                const [updateResult] = await connection.query(
                    `UPDATE game_state 
                    SET thread_id = ?,
                        game_data = ?,
                        last_updated = NOW()
                    WHERE game_id = ? AND user_id = ?`,
                    [newThreadId, gameDataToSave, gameId, userId]
                );
                
                if (updateResult.affectedRows === 0) {
                    throw new Error("Game update failed");
                }
                
                // 이전 스레드 삭제 (비동기)
                openai.beta.threads.del(oldThreadId)
                    .then(() => console.log(`${LOG_HEADER} Old thread deleted: ${oldThreadId}`))
                    .catch(e => console.error(`${LOG_HEADER} Error deleting old thread:`, e));

                console.log(`[${LOG_HEADER}] Game saved successfully: ${gameId}`);
                return {
                    success: true,
                    newThreadId: newThreadId,
                    summary: summary,
                    initialResponse: initialResponse,
                    gameData: gameDataObj
                };

            } finally {
                connection.release();
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            return {
                success: false,
                error: e.message
            };
        }
    }

    //============================================================================================
    async listGames(userId) {
    //============================================================================================
        const LOG_HEADER = "GAME_SERVICE/LIST";
        
        try {
            const connection = await pool.getConnection();
            try {
                const [games] = await connection.query(
                    `SELECT game_id, user_id, thread_id, assistant_id, game_data, 
                     created_at, last_updated 
                     FROM game_state 
                     WHERE user_id = ? 
                     ORDER BY last_updated DESC`,
                    [userId]
                );

                const processedGames = games.map(game => {
                    let parsedGameData = this.normalizeGameData(game.game_data);
                    
                    // 플레이 시간 계산
                    const now = new Date();
                    const lastUpdated = new Date(game.last_updated);
                    const created = new Date(game.created_at);
                    const playTimeMinutes = Math.floor((lastUpdated - created) / (1000 * 60));
                    
                    parsedGameData.progress.playTime = this.formatPlayTime(playTimeMinutes);
                    
                    return {
                        ...game,
                        game_data: parsedGameData
                    };
                });

                console.log(`[${LOG_HEADER}] Retrieved ${processedGames.length} games`);
                return processedGames;

            } finally {
                connection.release();
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    //============================================================================================
    async deleteGame(gameId, userId) {
    //============================================================================================
        const LOG_HEADER = "GAME_SERVICE/DELETE";
        
        try {
            const connection = await pool.getConnection();
            try {
                const [game] = await connection.query(
                    'SELECT thread_id FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (game.length > 0) {
                    try {
                        await openai.beta.threads.del(game[0].thread_id);
                        console.log(`[${LOG_HEADER}] Thread deleted: ${game[0].thread_id}`);
                    } catch (error) {
                        console.error(`[${LOG_HEADER}] Delete thread error:`, error);
                    }
                }

                const [result] = await connection.query(
                    'DELETE FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (result.affectedRows === 0) {
                    throw new Error("Game not found or unauthorized");
                }

                console.log(`[${LOG_HEADER}] Game deleted: ${gameId}`);
                return true;

            } finally {
                connection.release();
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }
}

module.exports = new GameService();
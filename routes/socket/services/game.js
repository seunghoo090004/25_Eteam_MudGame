// routes/socket/services/game.js - 레퍼런스 패턴 적용

const { pool } = require('../../../config/database');
const openai = require('../../../config/openai');
const { v4: uuidv4 } = require('uuid');
const my_reqinfo = require('../../../utils/reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

class GameService {
    
    // ============================================================================
    // 유틸리티 함수들
    // ============================================================================
    
    normalizeGameData(gameData) {
        const LOG_HEADER_TITLE = "NORMALIZE_GAME_DATA";
        const LOG_HEADER = "GameService --> " + LOG_HEADER_TITLE;
        
        const catch_parsing = -1;
        
        let gameDataObj;
        
        try {
            gameDataObj = typeof gameData === 'string' 
                ? JSON.parse(gameData) 
                : gameData;
        } catch (e) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(parsing_error)",
                value: catch_parsing,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data: { input_type: typeof gameData }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
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

    generateStatusText(gameData) {
        const health = gameData.player?.health || 100;
        const deathCount = gameData.progress?.deathCount || 0;
        
        if (health <= 20) return '위험 상태!';
        if (deathCount > 5) return `사망 ${deathCount}회`;
        if (health <= 50) return '주의 필요';
        return '안정';
    }

    generateStatusIcon(gameData) {
        const health = gameData.player?.health || 100;
        
        if (health <= 20) return '🔥';
        if (health <= 50) return '⚠️';
        return '✅';
    }

    extractLocationFromResponse(response) {
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
        const LOG_HEADER_TITLE = "CREATE_NEW_GAME";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(userId) + "] AssistantId[" + my_reqinfo.maskId(assistantId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_openai = -1;
        const catch_sqlconn = -2;
        const catch_sql_insert = -3;
        
        const EXT_data = { userId, assistantId };
        
        let connection;
        
        try {
            // OpenAI 스레드 생성
            let thread;
            try {
                thread = await openai.beta.threads.create();
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_thread_create)",
                    value: catch_openai,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
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
            
            // DB 연결
            try {
                connection = await pool.getConnection();
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sqlconn);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(db_connection)",
                    value: catch_sqlconn,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 게임 데이터 삽입
            try {
                await connection.query(
                    `INSERT INTO game_state 
                    (game_id, user_id, thread_id, assistant_id, game_data, created_at, last_updated) 
                    VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                    [gameId, userId, thread.id, assistantId, JSON.stringify(initialGameData)]
                );
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_insert);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_insert)",
                    value: catch_sql_insert,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            } finally {
                if (connection) connection.release();
            }

            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    gameId,
                    threadId: thread.id,
                    gameData: initialGameData
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            return ret_data.value_ext2;

        } catch (e) {
            if (connection) connection.release();
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    async loadGame(gameId, userId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "LOAD_GAME";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_sqlconn = -1;
        const catch_sql_select = -2;
        const catch_openai = -3;
        const catch_data_processing = -4;
        
        const EXT_data = { gameId, userId };
        
        let connection;
        
        try {
            // DB 연결
            try {
                connection = await pool.getConnection();
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sqlconn);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(db_connection)",
                    value: catch_sqlconn,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 게임 데이터 조회
            let games;
            try {
                [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (games.length === 0) {
                    throw new Error("Game not found");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            const gameData = games[0];
            
            if (!gameData.thread_id) {
                ret_status = fail_status + (-1 * catch_data_processing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(invalid_thread_id)",
                    value: catch_data_processing,
                    value_ext1: ret_status,
                    value_ext2: "Invalid thread ID",
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 메시지 히스토리 가져오기
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
                        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Message content error:", contentError);
                    }
                    
                    return {
                        role: msg.role,
                        content: content,
                        created_at: new Date(msg.created_at * 1000)
                    };
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_messages_list)",
                    value: catch_openai,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                chatHistory = [];
            }

            // 게임 데이터 정규화
            let parsedGameData;
            try {
                parsedGameData = this.normalizeGameData(gameData.game_data);
                
                // 플레이 시간 업데이트
                const now = new Date();
                const created = new Date(gameData.created_at);
                const playTimeMinutes = Math.floor((now - created) / (1000 * 60));
                parsedGameData.progress.playTime = this.formatPlayTime(playTimeMinutes);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_data_processing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(data_processing)",
                    value: catch_data_processing,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            } finally {
                if (connection) connection.release();
            }
            
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    ...gameData,
                    game_data: parsedGameData,
                    chatHistory
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { ...ret_data.value_ext2, chatHistory: `${chatHistory.length} messages` }
            }, null, 2));
            
            return ret_data.value_ext2;

        } catch (e) {
            if (connection) connection.release();
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    async saveGame(gameId, userId, gameData) {
    //============================================================================================
        const LOG_HEADER_TITLE = "SAVE_GAME";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_sqlconn = -1;
        const catch_sql_select = -2;
        const catch_openai_summary = -3;
        const catch_openai_thread = -4;
        const catch_sql_update = -5;
        const catch_data_processing = -6;
        
        const EXT_data = { gameId, userId };
        
        let connection;
        
        try {
            // DB 연결
            try {
                connection = await pool.getConnection();
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sqlconn);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(db_connection)",
                    value: catch_sqlconn,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 기존 게임 정보 로드
            let games;
            try {
                [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );
                
                if (games.length === 0) {
                    throw new Error("Game not found or unauthorized");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            const game = games[0];
            const oldThreadId = game.thread_id;
            
            // 게임 데이터 정규화
            let gameDataObj;
            try {
                gameDataObj = this.normalizeGameData(gameData);
                
                // 플레이 시간 계산
                const now = new Date();
                const created = new Date(game.created_at);
                const playTimeMinutes = Math.floor((now - created) / (1000 * 60));
                gameDataObj.progress.playTime = this.formatPlayTime(playTimeMinutes);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_data_processing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(data_processing)",
                    value: catch_data_processing,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
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
                
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_summary);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_summary)",
                    value: catch_openai_summary,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                // 오류 시 기본값 사용
                try {
                    const newThread = await openai.beta.threads.create();
                    newThreadId = newThread.id;
                    summary = "게임이 저장되었습니다.";
                    initialResponse = "게임을 이어서 진행합니다.";
                } catch (threadError) {
                    ret_status = fail_status + (-1 * catch_openai_thread);
                    ret_data = {
                        code: LOG_HEADER_TITLE + "(openai_thread_fallback)",
                        value: catch_openai_thread,
                        value_ext1: ret_status,
                        value_ext2: threadError.message,
                        EXT_data
                    };
                    console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                    throw new Error(ret_data.value_ext2);
                }
            }
            
            // 게임 데이터 저장
            try {
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
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_update);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_update)",
                    value: catch_sql_update,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            } finally {
                if (connection) connection.release();
            }
            
            // 이전 스레드 삭제 (비동기)
            openai.beta.threads.del(oldThreadId)
                .then(() => console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Old thread deleted: " + oldThreadId))
                .catch(e => console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Error deleting old thread:", e));

            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    success: true,
                    newThreadId: newThreadId,
                    summary: summary,
                    initialResponse: initialResponse,
                    gameData: gameDataObj
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            return ret_data.value_ext2;

        } catch (e) {
            if (connection) connection.release();
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            return {
                success: false,
                error: e.message
            };
        }
    }

    //============================================================================================
    async listGames(userId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "LIST_GAMES";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_sqlconn = -1;
        const catch_sql_select = -2;
        const catch_data_processing = -3;
        
        const EXT_data = { userId };
        
        let connection;
        
        try {
            // DB 연결
            try {
                connection = await pool.getConnection();
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sqlconn);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(db_connection)",
                    value: catch_sqlconn,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 게임 목록 조회
            let games;
            try {
                [games] = await connection.query(
                    `SELECT game_id, user_id, thread_id, assistant_id, game_data, 
                     created_at, last_updated 
                     FROM game_state 
                     WHERE user_id = ? 
                     ORDER BY last_updated DESC`,
                    [userId]
                );
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            } finally {
                if (connection) connection.release();
            }

            // 게임 데이터 처리
            let processedGames;
            try {
                processedGames = games.map(game => {
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
            } catch (e) {
                ret_status = fail_status + (-1 * catch_data_processing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(data_processing)",
                    value: catch_data_processing,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            ret_data = {
                code: "result",
                value: processedGames.length,
                value_ext1: ret_status,
                value_ext2: processedGames,
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: `${processedGames.length} games processed`
            }, null, 2));
            
            return processedGames;

        } catch (e) {
            if (connection) connection.release();
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    async deleteGame(gameId, userId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "DELETE_GAME";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_sqlconn = -1;
        const catch_sql_select = -2;
        const catch_openai = -3;
        const catch_sql_delete = -4;
        
        const EXT_data = { gameId, userId };
        
        let connection;
        
        try {
            // DB 연결
            try {
                connection = await pool.getConnection();
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sqlconn);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(db_connection)",
                    value: catch_sqlconn,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 게임 정보 조회 (스레드 ID 확인용)
            let game;
            try {
                [game] = await connection.query(
                    'SELECT thread_id FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_select);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_select)",
                    value: catch_sql_select,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // OpenAI 스레드 삭제
            if (game.length > 0) {
                try {
                    await openai.beta.threads.del(game[0].thread_id);
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Thread deleted: " + game[0].thread_id);
                } catch (e) {
                    ret_status = fail_status + (-1 * catch_openai);
                    ret_data = {
                        code: LOG_HEADER_TITLE + "(openai_thread_delete)",
                        value: catch_openai,
                        value_ext1: ret_status,
                        value_ext2: e.message,
                        EXT_data
                    };
                    console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                    // 스레드 삭제 실패는 경고로만 처리하고 계속 진행
                }
            }

            // DB에서 게임 삭제
            let result;
            try {
                [result] = await connection.query(
                    'DELETE FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (result.affectedRows === 0) {
                    throw new Error("Game not found or unauthorized");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_sql_delete);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(sql_delete)",
                    value: catch_sql_delete,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            } finally {
                if (connection) connection.release();
            }

            ret_data = {
                code: "result",
                value: result.affectedRows,
                value_ext1: ret_status,
                value_ext2: {
                    deleted: true,
                    affectedRows: result.affectedRows
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            return true;

        } catch (e) {
            if (connection) connection.release();
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }
}

module.exports = new GameService();
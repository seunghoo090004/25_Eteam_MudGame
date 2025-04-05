// routes/socket/services/game.js
// 게임 상태 CRUD 및 데이터베이스 연동 로직


const pool = require('../../../config/database');
const openai = require('../../../config/openai');
const { v4: uuidv4 } = require('uuid');
const reqinfo = require('../../../utils/reqinfo');

class GameService {
    //============================================================================================
    async createNewGame(userId, assistantId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "CREATE_NEW_GAME";
        const LOG_HEADER = "UserId[" + userId + "] AssistantId[" + assistantId + "] --> " + LOG_HEADER_TITLE;
        const LOG_ERR_HEADER = "[FAIL]";
        const LOG_SUCC_HEADER = "[SUCC]";
        
        let ret_status = 200;
        let ret_data;
        
        try {
            const thread = await openai.beta.threads.create();
            const gameId = uuidv4();
            
            const initialGameData = {
                player: {
                    name: "플레이어",
                    level: 1,
                    exp: 0,
                    health: 100
                },
                location: {
                    current: "시작마을",
                    discovered: ["시작마을"]
                },
                inventory: {
                    items: [],
                    gold: 0
                },
                progress: {
                    phase: "튜토리얼",
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
                    (game_id, user_id, thread_id, assistant_id, game_data) 
                    VALUES (?, ?, ?, ?, ?)`,
                    [gameId, userId, thread.id, assistantId, JSON.stringify(initialGameData)]
                );

                ret_data = {
                    gameId,
                    threadId: thread.id,
                    gameData: initialGameData
                };

            } finally {
                connection.release();
            }

        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            throw e;
        }

        console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
        return ret_data;
    }

    //============================================================================================
    async loadGame(gameId, userId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "LOAD_GAME";
        const LOG_HEADER = "GameId[" + gameId + "] UserId[" + userId + "] --> " + LOG_HEADER_TITLE;
        const LOG_ERR_HEADER = "[FAIL]";
        const LOG_SUCC_HEADER = "[SUCC]";
        
        let ret_status = 200;
        let ret_data;

        try {
            const connection = await pool.getConnection();
            try {
                const [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (games.length === 0) {
                    throw "Game not found";
                }

                const gameData = games[0];
                const messages = await openai.beta.threads.messages.list(gameData.thread_id);
                const chatHistory = messages.data.map(msg => ({
                    role: msg.role,
                    content: msg.content[0].text.value,
                    created_at: new Date(msg.created_at * 1000)
                }));

                ret_data = {
                    ...gameData,
                    game_data: typeof gameData.game_data === 'string' 
                        ? JSON.parse(gameData.game_data) 
                        : gameData.game_data,
                    chatHistory
                };

            } finally {
                connection.release();
            }

        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            throw e;
        }

        console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
        return ret_data;
    }

    //============================================================================================
    async saveGame(gameId, userId, gameData) {
    //============================================================================================
        const LOG_HEADER_TITLE = "SAVE_GAME";
        const LOG_HEADER = "GameId[" + gameId + "] UserId[" + userId + "] --> " + LOG_HEADER_TITLE;
        const LOG_ERR_HEADER = "[FAIL]";
        const LOG_SUCC_HEADER = "[SUCC]";
        
        let ret_status = 200;

        try {
            const connection = await pool.getConnection();
            try {
                // 1. 기존 게임 정보 로드
                const [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );
                
                if (games.length === 0) {
                    throw "Game not found or unauthorized";
                }
                
                const game = games[0];
                
                // 2. AI를 통해 게임 히스토리 요약 생성
                const chatService = require('./chat');
                const summary = await chatService.createGameSummary(game.thread_id, game.assistant_id);
                
                // 3. 새 스레드 생성
                const newThread = await openai.beta.threads.create();
                
                // 4. 요약 정보를 새 스레드에 초기 메시지로 전달
                await openai.beta.threads.messages.create(newThread.id, {
                    role: "user",
                    content: `이전 게임 요약: ${summary}\n\n계속 진행해주세요.`
                });
                
                // 5. 게임 스레드 ID 업데이트 및 게임 데이터 저장
                const [result] = await connection.query(
                    `UPDATE game_state 
                    SET thread_id = ?,
                        game_data = ?,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE game_id = ? AND user_id = ?`,
                    [newThread.id, JSON.stringify(gameData), gameId, userId]
                );
                
                if (result.affectedRows === 0) {
                    throw "Game update failed";
                }
                
                // 6. 이전 스레드 삭제
                await openai.beta.threads.del(game.thread_id);

            } finally {
                connection.release();
            }

        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            throw e;
        }

        console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
        return true;
    }
    //============================================================================================
    async listGames(userId) {
    //============================================================================================
    const LOG_HEADER_TITLE = "LIST_GAMES";
    const LOG_HEADER = "UserId[" + userId + "] --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    let ret_status = 200;
    let ret_data;

    try {
        const connection = await pool.getConnection();
        try {
            const [games] = await connection.query(
                'SELECT game_id, user_id, thread_id, assistant_id, game_data, created_at, last_updated FROM game_state WHERE user_id = ? ORDER BY last_updated DESC',
                [userId]
            );

            ret_data = games.map(game => ({
                ...game,
                game_data: typeof game.game_data === 'string' 
                    ? JSON.parse(game.game_data) 
                    : game.game_data
            }));

        } finally {
            connection.release();
        }

    } catch (e) {
        ret_status = 501;
        console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
        throw e;
    }

    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return ret_data;
}

    //============================================================================================
    async deleteGame(gameId, userId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "DELETE_GAME";
        const LOG_HEADER = "GameId[" + gameId + "] UserId[" + userId + "] --> " + LOG_HEADER_TITLE;
        const LOG_ERR_HEADER = "[FAIL]";
        const LOG_SUCC_HEADER = "[SUCC]";
        
        let ret_status = 200;

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
                    } catch (error) {
                        console.error(LOG_ERR_HEADER + LOG_HEADER + "Delete thread error: " + error);
                    }
                }

                const [result] = await connection.query(
                    'DELETE FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (result.affectedRows === 0) {
                    throw "Game not found or unauthorized";
                }

            } finally {
                connection.release();
            }

        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            throw e;
        }

        console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
        return true;
    }
}

module.exports = new GameService();
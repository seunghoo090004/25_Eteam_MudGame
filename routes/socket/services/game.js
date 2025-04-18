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
        let result = { success: true };
    
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
                const oldThreadId = game.thread_id;
                
                // 2. 게임 데이터 정규화 - 항상 객체로 변환 후 다시 직렬화
                let gameDataObj;
                try {
                    gameDataObj = typeof gameData === 'string' 
                        ? JSON.parse(gameData) 
                        : gameData;
                } catch(e) {
                    console.error(`${LOG_HEADER} JSON 파싱 오류, 원본 데이터 사용:`, e);
                    gameDataObj = gameData; // 파싱 실패 시 원본 사용
                }
                
                // 데이터 로깅
                console.log(`${LOG_HEADER} 처리된 게임 데이터 객체:`, gameDataObj);
                
                // 3. AI를 통해 게임 히스토리 요약 생성
                const chatService = require('./chat');
                const summary = await chatService.createGameSummary(oldThreadId, game.assistant_id);
                
                // 4. 새 스레드 생성
                const newThread = await openai.beta.threads.create();
                
                // 5. 요약 정보를 새 스레드에 초기 메시지로 전달
                await openai.beta.threads.messages.create(newThread.id, {
                    role: "user",
                    content: `이전 게임 요약: ${summary}\n\n계속 진행해주세요.`
                });
                
                // 6. 새 스레드에서 초기 응답 가져오기 - 수정된 부분
                const run = await openai.beta.threads.runs.create(newThread.id, {
                    assistant_id: game.assistant_id
                });
                
                // 실행 완료 대기
                let runStatus;
                do {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(newThread.id, run.id);
                } while (runStatus.status === 'queued' || runStatus.status === 'in_progress');
                
                let initialResponse = "";
                if (runStatus.status === 'completed') {
                    const messages = await openai.beta.threads.messages.list(newThread.id);
                    initialResponse = messages.data[0].content[0].text.value;
                } else {
                    console.error(`${LOG_ERR_HEADER} 초기 응답 생성 실패: ${runStatus.status}`);
                    initialResponse = "게임을 이어서 진행합니다. 다음 행동을 선택해주세요.";
                }
                
                // 7. 게임 데이터 직렬화
                const gameDataToSave = JSON.stringify(gameDataObj);
                console.log(`${LOG_HEADER} 저장할 JSON 데이터:`, gameDataToSave);
                
                // 8. 게임 스레드 ID 업데이트 및 게임 데이터 저장
                const [updateResult] = await connection.query(
                    `UPDATE game_state 
                    SET thread_id = ?,
                        game_data = ?,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE game_id = ? AND user_id = ?`,
                    [newThread.id, gameDataToSave, gameId, userId]
                );
                
                if (updateResult.affectedRows === 0) {
                    throw "Game update failed";
                }
                
                // 9. 저장 후 확인 (선택적)
                const [updatedGame] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );
                
                if (updatedGame.length > 0) {
                    try {
                        const savedData = JSON.parse(updatedGame[0].game_data);
                        console.log(`${LOG_HEADER} 저장 확인 - 저장된 데이터:`, savedData);
                    } catch (e) {
                        console.error(`${LOG_HEADER} 저장된 데이터 파싱 오류:`, e);
                    }
                }
                
                // 10. 이전 스레드 삭제 (비동기로 처리)
                openai.beta.threads.del(oldThreadId)
                    .then(() => console.log(`${LOG_SUCC_HEADER} Old thread ${oldThreadId} deleted`))
                    .catch(e => console.error(`${LOG_ERR_HEADER} Error deleting old thread: ${e}`));
    
                // 11. 결과 정보 설정
                result = {
                    success: true,
                    newThreadId: newThread.id,
                    summary: summary,
                    initialResponse: initialResponse
                };
    
            } finally {
                connection.release();
            }
    
        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            result = {
                success: false,
                error: e.message || e
            };
        }
    
        console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
        return result;
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
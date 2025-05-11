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
                health: 100,
                effects: '없음'
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
                items: [],
                gold: 0
            },
            progress: {
                deathCount: 0,
                discoveries: '없음',
                puzzlesSolved: 0,
                phase: "탈출",
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
                    throw new Error("Game not found");
                }

                const gameData = games[0];
                
                // 스레드 ID 유효성 확인
                if (!gameData.thread_id) {
                    throw new Error("Invalid thread ID");
                }
                
                // 메시지 히스토리 안전하게 가져오기
                let chatHistory;
                try {
                    const messages = await openai.beta.threads.messages.list(gameData.thread_id);
                    chatHistory = messages.data.map(msg => {
                        // 메시지 내용이 없거나 비어있으면 안전한 기본값 사용
                        let content = "메시지 내용을 불러올 수 없습니다.";
                        try {
                            if (msg.content && msg.content.length > 0 && msg.content[0].text) {
                                content = msg.content[0].text.value;
                            }
                        } catch (contentError) {
                            console.error(`${LOG_ERR_HEADER} Message content error:`, contentError);
                        }
                        
                        return {
                            role: msg.role,
                            content: content,
                            created_at: new Date(msg.created_at * 1000)
                        };
                    });
                } catch (messageError) {
                    console.error(`${LOG_ERR_HEADER} Error fetching messages:`, messageError);
                    chatHistory = []; // 오류 시 빈 배열 사용
                }

                // 게임 데이터 파싱 (문자열인 경우만)
                let parsedGameData;
                try {
                    parsedGameData = typeof gameData.game_data === 'string' 
                        ? JSON.parse(gameData.game_data) 
                        : gameData.game_data;
                } catch (parseError) {
                    console.error(`${LOG_ERR_HEADER} Game data parsing error:`, parseError);
                    // 파싱 실패 시 기본 게임 데이터 사용
                    parsedGameData = {
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
                }
                
                ret_data = {
                    ...gameData,
                    game_data: parsedGameData,
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
                    throw new Error("Game not found or unauthorized");
                }
                
                const game = games[0];
                const oldThreadId = game.thread_id;
                
                // 2. 게임 데이터 정규화 - 안전한 변환 로직 추가
                let gameDataObj;
                try {
                    // 문자열이 아니면 문자열로 변환 시도
                    const gameDataStr = typeof gameData === 'string' 
                        ? gameData 
                        : JSON.stringify(gameData);
                        
                    // 문자열을 객체로 파싱
                    gameDataObj = JSON.parse(gameDataStr);
                    
                    // 필수 필드 확인
                    if (!gameDataObj || typeof gameDataObj !== 'object') {
                        throw new Error("Invalid game data structure");
                    }
                    
                    // 기본 게임 데이터 구조 확인 및 보정
                    gameDataObj.player = gameDataObj.player || {
                        name: "플레이어",
                        level: 1,
                        exp: 0,
                        health: 100
                    };
                    
                    gameDataObj.location = gameDataObj.location || {
                        current: "시작마을",
                        discovered: ["시작마을"]
                    };
                    
                    gameDataObj.inventory = gameDataObj.inventory || {
                        items: [],
                        gold: 0
                    };
                    
                    gameDataObj.progress = gameDataObj.progress || {
                        phase: "튜토리얼",
                        flags: {
                            tutorialComplete: false,
                            metNPC: false
                        }
                    };
                    
                } catch(e) {
                    console.error(`${LOG_HEADER} JSON 파싱 오류, 기본 데이터 사용:`, e);
                    // 파싱 실패 시 기본 게임 데이터 구조 사용
                    gameDataObj = {
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
                }
                
                // 데이터 로깅
                console.log(`${LOG_HEADER} 처리된 게임 데이터 객체:`, JSON.stringify(gameDataObj).substring(0, 200) + '...');
                
                // 3. AI를 통해 게임 히스토리 요약 생성 - 충분한 대기 시간 추가
                try {
                    // 기존 실행 중인 프로세스 완료 대기
                    const runs = await openai.beta.threads.runs.list(oldThreadId);
                    const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
                    
                    if (activeRun) {
                        console.log(`${LOG_HEADER} 기존 실행 중인 프로세스 대기: ${activeRun.id}`);
                        let runStatus;
                        do {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            runStatus = await openai.beta.threads.runs.retrieve(oldThreadId, activeRun.id);
                        } while (['in_progress', 'queued'].includes(runStatus.status));
                    }
                    
                    // 추가 대기 시간으로 동기화 보장
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    const chatService = require('./chat');
                    const summary = await chatService.createGameSummary(oldThreadId, game.assistant_id);
                    
                    // 4. 요약 정보에서 위치 추출
                    const locationFromSummary = this.extractLocationFromSummary(summary);
                    console.log(`${LOG_HEADER} 요약에서 추출한 위치: ${locationFromSummary}`);
                    
                    // 추출된 위치 정보가 있으면 게임 데이터 업데이트
                    if (locationFromSummary && gameDataObj && gameDataObj.location) {
                        gameDataObj.location.current = locationFromSummary;
                        
                        // 위치 정보 추가 되었는지 검증 및 로깅
                        console.log(`${LOG_HEADER} 위치 정보 업데이트: ${gameDataObj.location.current}`);
                        
                        // 발견한 위치 목록에 추가
                        if (Array.isArray(gameDataObj.location.discovered) && 
                            !gameDataObj.location.discovered.includes(locationFromSummary)) {
                            gameDataObj.location.discovered.push(locationFromSummary);
                        }
                    }
                    
                    // 5. 새 스레드 생성
                    const newThread = await openai.beta.threads.create();
                    
                    // 6. 요약 정보를 새 스레드에 초기 메시지로 전달 - 비동기 처리 개선
                    await openai.beta.threads.messages.create(newThread.id, {
                        role: "user",
                        content: `이전 게임 요약: ${summary}\n\n계속 진행해주세요.`
                    });
                    
                    // 7. 새 스레드에서 초기 응답 가져오기 - 대기 시간 추가
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const run = await openai.beta.threads.runs.create(newThread.id, {
                        assistant_id: game.assistant_id
                    });
                    
                    // 실행 완료 대기 - 상태 확인 개선
                    let runStatus;
                    let initialResponse = "";
                    
                    do {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        runStatus = await openai.beta.threads.runs.retrieve(newThread.id, run.id);
                        console.log(`${LOG_HEADER} Run status: ${runStatus.status}`);
                    } while (['queued', 'in_progress'].includes(runStatus.status));
                    
                    if (runStatus.status === 'completed') {
                        // 추가 안정화 대기 시간
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        const messages = await openai.beta.threads.messages.list(newThread.id);
                        
                        if (messages.data && messages.data.length > 0 && 
                            messages.data[0].content && messages.data[0].content[0] && 
                            messages.data[0].content[0].text) {
                            initialResponse = messages.data[0].content[0].text.value;
                        } else {
                            console.error(`${LOG_ERR_HEADER} 초기 응답 형식 오류`);
                            initialResponse = "게임을 이어서 진행합니다. 다음 행동을 선택해주세요.";
                        }
                    } else {
                        console.error(`${LOG_ERR_HEADER} 초기 응답 생성 실패: ${runStatus.status}`);
                        initialResponse = "게임을 이어서 진행합니다. 다음 행동을 선택해주세요.";
                    }
                    
                    // 8. 게임 데이터 직렬화
                    const gameDataToSave = JSON.stringify(gameDataObj);
                    console.log(`${LOG_HEADER} 저장할 JSON 데이터 길이:`, gameDataToSave.length);
                    
                    // 9. 게임 스레드 ID 업데이트 및 게임 데이터 저장
                    const [updateResult] = await connection.query(
                        `UPDATE game_state 
                        SET thread_id = ?,
                            game_data = ?,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE game_id = ? AND user_id = ?`,
                        [newThread.id, gameDataToSave, gameId, userId]
                    );
                    
                    if (updateResult.affectedRows === 0) {
                        throw new Error("Game update failed");
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
                        extractedLocation: locationFromSummary,
                        initialResponse: initialResponse
                    };
                    
                } catch (summaryError) {
                    console.error(`${LOG_ERR_HEADER} 게임 요약 생성 오류:`, summaryError);
                    
                    // 오류 시에도 게임은 저장 (기본 데이터로)
                    // 5. 새 스레드 생성
                    const newThread = await openai.beta.threads.create();
                    
                    // 게임 데이터 직렬화
                    const gameDataToSave = JSON.stringify(gameDataObj);
                    
                    // 게임 스레드 ID 업데이트 및 게임 데이터 저장
                    const [updateResult] = await connection.query(
                        `UPDATE game_state 
                        SET thread_id = ?,
                            game_data = ?,
                            last_updated = CURRENT_TIMESTAMP
                        WHERE game_id = ? AND user_id = ?`,
                        [newThread.id, gameDataToSave, gameId, userId]
                    );
                    
                    // 기본 응답 설정
                    result = {
                        success: true,
                        newThreadId: newThread.id,
                        summary: "게임 진행 상황이 저장되었습니다.",
                        extractedLocation: gameDataObj.location.current,
                        initialResponse: "게임을 이어서 진행합니다. 다음 행동을 선택해주세요."
                    };
                }

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

            ret_data = games.map(game => {
                // 게임 데이터 파싱 시 안전 처리
                let parsedGameData;
                try {
                    parsedGameData = typeof game.game_data === 'string' 
                        ? JSON.parse(game.game_data) 
                        : game.game_data;
                } catch (parseError) {
                    console.error(`${LOG_ERR_HEADER} Game data parsing error for game ${game.game_id}:`, parseError);
                    parsedGameData = {
                        player: { name: "플레이어", level: 1, health: 100 },
                        location: { current: "알 수 없음", discovered: ["시작마을"] },
                        inventory: { items: [], gold: 0 },
                        progress: { phase: "튜토리얼" }
                    };
                }
                
                return {
                    ...game,
                    game_data: parsedGameData
                };
            });

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
                    throw new Error("Game not found or unauthorized");
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

    // 요약 정보에서 위치 추출 함수 추가
    extractLocationFromSummary(summary) {
        const locationPattern = /현재\s*위치:\s*([^,]+),\s*([^,]+),\s*던전\s*레벨\s*(\d+)/;
        const match = summary.match(locationPattern);
        
        if (match) {
            // 객체가 아닌 문자열로 반환
            const roomName = match[2].trim();
            return roomName;
        }
        
        return null;
    }
}

module.exports = new GameService();
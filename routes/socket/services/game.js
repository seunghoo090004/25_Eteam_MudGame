// routes/socket/services/game.js - 프로시저 기반 3티어 패턴 (레퍼런스 패턴 적용)

'use strict';
const { callProcedure, callSelectProcedure, callBusinessProcedure, generateUUID } = require('../../../config/database');
const openai = require('../../../config/openai');
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
            const ret_data = {
                code: LOG_HEADER_TITLE + "(json_parsing)",
                value: catch_parsing,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data: { gameDataType: typeof gameData }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error("Invalid game data format");
        }
        
        // 기본 구조 보장
        const normalizedData = {
            player: {
                name: gameDataObj.player?.name || "플레이어",
                level: gameDataObj.player?.level || 1,
                health: gameDataObj.player?.health || 100,
                exp: gameDataObj.player?.exp || 0,
                ...gameDataObj.player
            },
            location: {
                current: gameDataObj.location?.current || "시작마을",
                discovered: gameDataObj.location?.discovered || ["시작마을"],
                ...gameDataObj.location
            },
            inventory: {
                gold: gameDataObj.inventory?.gold || 0,
                items: gameDataObj.inventory?.items || [],
                ...gameDataObj.inventory
            },
            progress: {
                phase: gameDataObj.progress?.phase || "튜토리얼",
                flags: gameDataObj.progress?.flags || { metNPC: false, tutorialComplete: false },
                ...gameDataObj.progress
            }
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + " Game data normalized successfully");
        return normalizedData;
    }
    
    validateGameId(gameId) {
        const LOG_HEADER_TITLE = "VALIDATE_GAME_ID";
        const LOG_HEADER = "GameService --> " + LOG_HEADER_TITLE;
        
        if (!gameId || typeof gameId !== 'string' || gameId.length < 7) {
            const ret_data = {
                code: LOG_HEADER_TITLE + "(validation_failed)",
                value: -1,
                value_ext1: 400,
                value_ext2: "Invalid game ID format",
                EXT_data: { gameId: gameId, gameIdType: typeof gameId }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error("Invalid game ID format");
        }
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + " Game ID validated successfully");
        return true;
    }
    
    validateUserId(userId) {
        const LOG_HEADER_TITLE = "VALIDATE_USER_ID";
        const LOG_HEADER = "GameService --> " + LOG_HEADER_TITLE;
        
        if (!userId || typeof userId !== 'string' || userId.length < 7) {
            const ret_data = {
                code: LOG_HEADER_TITLE + "(validation_failed)",
                value: -1,
                value_ext1: 400,
                value_ext2: "Invalid user ID format",
                EXT_data: { userId: userId, userIdType: typeof userId }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error("Invalid user ID format");
        }
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + " User ID validated successfully");
        return true;
    }
    
    // ============================================================================
    // 게임 생성
    // ============================================================================
    
    async createNewGame(userId, assistantId) {
        const LOG_HEADER_TITLE = "CREATE_NEW_GAME";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(userId) + "] AssistantId[" + my_reqinfo.maskId(assistantId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_thread_creation = -2;
        const catch_game_data_creation = -3;
        const catch_procedure_call = -4;
        
        const EXT_data = {
            userId: my_reqinfo.maskId(userId),
            assistantId: my_reqinfo.maskId(assistantId)
        };
        
        try {
            //----------------------------------------------------------------------
            // 입력층: 입력 검증
            //----------------------------------------------------------------------
            try {
                this.validateUserId(userId);
                
                if (!assistantId || assistantId.length < 7) {
                    throw new Error("Invalid assistant ID");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Input validation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: OpenAI 스레드 생성
            //----------------------------------------------------------------------
            let threadId;
            try {
                const thread = await openai.beta.threads.create();
                threadId = thread.id;
                
                if (!threadId) {
                    throw new Error("Thread creation failed");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_thread_creation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(thread_creation)",
                    value: catch_thread_creation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("OpenAI thread creation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 게임 데이터 생성
            //----------------------------------------------------------------------
            let gameData, gameId;
            try {
                gameId = generateUUID();
                gameData = this.normalizeGameData({
                    player: {
                        name: "플레이어",
                        level: 1,
                        health: 100,
                        exp: 0
                    },
                    location: {
                        current: "시작마을",
                        discovered: ["시작마을"]
                    },
                    inventory: {
                        gold: 0,
                        items: []
                    },
                    progress: {
                        phase: "튜토리얼",
                        flags: {
                            metNPC: false,
                            tutorialComplete: false
                        }
                    }
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_data_creation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_data_creation)",
                    value: catch_game_data_creation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Game data creation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 프로시저 호출 (게임 상태 저장)
            //----------------------------------------------------------------------
            let procedureResult;
            try {
                procedureResult = await callProcedure('pc_tgame_state_ins', [
                    gameId,                    // p_game_id
                    userId,                    // p_user_id
                    threadId,                  // p_thread_id
                    assistantId,               // p_assistant_id
                    JSON.stringify(gameData)   // p_game_data
                ]);
                
                if (!procedureResult.success) {
                    throw new Error(procedureResult.message || "Game creation failed");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_procedure_call);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(procedure_call)",
                    value: catch_procedure_call,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Database operation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 출력층: 결과 반환
            //----------------------------------------------------------------------
            const successResult = {
                gameId: gameId,
                threadId: threadId,
                assistantId: assistantId,
                gameData: gameData
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { gameId: my_reqinfo.maskId(gameId), threadId: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (error) {
            // 예상치 못한 에러 처리
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -99,
                value_ext1: ret_status,
                value_ext2: error.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw error;
        }
    }
    
    // ============================================================================
    // 게임 로드
    // ============================================================================
    
    async loadGame(gameId, userId) {
        const LOG_HEADER_TITLE = "LOAD_GAME";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_procedure_call = -2;
        const catch_data_processing = -3;
        const catch_authorization = -4;
        
        const EXT_data = {
            gameId: my_reqinfo.maskId(gameId),
            userId: my_reqinfo.maskId(userId)
        };
        
        try {
            //----------------------------------------------------------------------
            // 입력층: 입력 검증
            //----------------------------------------------------------------------
            try {
                this.validateGameId(gameId);
                this.validateUserId(userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Input validation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 프로시저 호출 (게임 상태 조회)
            //----------------------------------------------------------------------
            let procedureResult;
            try {
                procedureResult = await callBusinessProcedure('pc_tgame_state_sel', 
                    [gameId], 
                    ['p_user_id', 'p_thread_id', 'p_assistant_id', 'p_game_data', 'p_created_at', 'p_updated_at']
                );
                
                if (!procedureResult.success) {
                    if (procedureResult.code === -100) {
                        throw new Error("Game not found");
                    }
                    throw new Error(procedureResult.message || "Failed to load game");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_procedure_call);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(procedure_call)",
                    value: catch_procedure_call,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Database operation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 권한 확인
            //----------------------------------------------------------------------
            try {
                const gameUserId = procedureResult.data.p_user_id;
                if (gameUserId !== userId) {
                    throw new Error("Access denied - not owner of this game");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_authorization);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(authorization)",
                    value: catch_authorization,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Authorization failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 게임 데이터 처리
            //----------------------------------------------------------------------
            let processedGameData;
            try {
                const rawGameData = procedureResult.data.p_game_data;
                processedGameData = this.normalizeGameData(rawGameData);
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
                throw new Error("Game data processing failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 출력층: 결과 반환
            //----------------------------------------------------------------------
            const successResult = {
                game_id: gameId,
                user_id: procedureResult.data.p_user_id,
                thread_id: procedureResult.data.p_thread_id,
                assistant_id: procedureResult.data.p_assistant_id,
                game_data: processedGameData,
                created_at: procedureResult.data.p_created_at,
                last_updated: procedureResult.data.p_updated_at
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { game_id: my_reqinfo.maskId(gameId), thread_id: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (error) {
            // 예상치 못한 에러 처리
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -99,
                value_ext1: ret_status,
                value_ext2: error.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw error;
        }
    }
    
    // ============================================================================
    // 게임 저장
    // ============================================================================
    
    async saveGame(gameId, gameData, userId) {
        const LOG_HEADER_TITLE = "SAVE_GAME";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_data_processing = -2;
        const catch_game_load = -3;
        const catch_authorization = -4;
        const catch_procedure_call = -5;
        
        const EXT_data = {
            gameId: my_reqinfo.maskId(gameId),
            userId: my_reqinfo.maskId(userId),
            gameDataType: typeof gameData
        };
        
        try {
            //----------------------------------------------------------------------
            // 입력층: 입력 검증
            //----------------------------------------------------------------------
            try {
                this.validateGameId(gameId);
                this.validateUserId(userId);
                
                if (!gameData) {
                    throw new Error("Game data is required");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Input validation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 게임 데이터 처리
            //----------------------------------------------------------------------
            let processedGameData;
            try {
                processedGameData = this.normalizeGameData(gameData);
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
                throw new Error("Game data processing failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 기존 게임 정보 로드 (권한 확인용)
            //----------------------------------------------------------------------
            let existingGame;
            try {
                existingGame = await this.loadGame(gameId, userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_load);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_load_for_auth)",
                    value: catch_game_load,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Failed to verify game ownership: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 프로시저 호출 (게임 상태 업데이트)
            //----------------------------------------------------------------------
            let procedureResult;
            try {
                procedureResult = await callProcedure('pc_tgame_state_upd', [
                    gameId,                                // p_game_id
                    existingGame.thread_id,                // p_thread_id (기존 값 유지)
                    existingGame.assistant_id,             // p_assistant_id (기존 값 유지)
                    JSON.stringify(processedGameData)      // p_game_data
                ]);
                
                if (!procedureResult.success) {
                    throw new Error(procedureResult.message || "Game save failed");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_procedure_call);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(procedure_call)",
                    value: catch_procedure_call,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Database operation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 출력층: 결과 반환
            //----------------------------------------------------------------------
            const successResult = {
                game_id: gameId,
                game_data: processedGameData,
                saved_at: new Date()
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { game_id: my_reqinfo.maskId(gameId), saved_at: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (error) {
            // 예상치 못한 에러 처리
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -99,
                value_ext1: ret_status,
                value_ext2: error.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw error;
        }
    }
    
    // ============================================================================
    // 게임 목록 조회
    // ============================================================================
    
    async listGames(userId) {
        const LOG_HEADER_TITLE = "LIST_GAMES";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_procedure_call = -2;
        const catch_data_processing = -3;
        
        const EXT_data = {
            userId: my_reqinfo.maskId(userId)
        };
        
        try {
            //----------------------------------------------------------------------
            // 입력층: 입력 검증
            //----------------------------------------------------------------------
            try {
                this.validateUserId(userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Input validation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 프로시저 호출 (게임 목록 조회)
            //----------------------------------------------------------------------
            let procedureResult;
            try {
                procedureResult = await callSelectProcedure('pc_tgame_state_sel_by_user', [userId]);
                
                if (!procedureResult.success) {
                    // 데이터가 없는 경우는 정상 (빈 배열 반환)
                    if (procedureResult.code === -100) {
                        return [];
                    }
                    throw new Error(procedureResult.message || "Failed to load games list");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_procedure_call);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(procedure_call)",
                    value: catch_procedure_call,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Database operation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 데이터 처리
            //----------------------------------------------------------------------
            let processedGames;
            try {
                const rawGames = procedureResult.data || [];
                
                processedGames = rawGames.map(game => {
                    try {
                        const normalizedGameData = this.normalizeGameData(game.game_data);
                        return {
                            game_id: game.id,
                            thread_id: game.thread_id,
                            assistant_id: game.assistant_id,
                            game_data: normalizedGameData,
                            created_at: game.dt7,
                            last_updated: game.dt8
                        };
                    } catch (parseError) {
                        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Failed to parse game:", {
                            game_id: game.id,
                            error: parseError.message
                        });
                        // 파싱 실패한 게임은 기본 구조로 반환
                        return {
                            game_id: game.id,
                            thread_id: game.thread_id,
                            assistant_id: game.assistant_id,
                            game_data: this.normalizeGameData({}),
                            created_at: game.dt7,
                            last_updated: game.dt8,
                            parsing_error: true
                        };
                    }
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
                throw new Error("Data processing failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 출력층: 결과 반환
            //----------------------------------------------------------------------
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: processedGames.length,
                value_ext1: ret_status,
                value_ext2: processedGames,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { gameCount: processedGames.length }
            }, null, 2));
            
            return processedGames;
            
        } catch (error) {
            // 예상치 못한 에러 처리
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -99,
                value_ext1: ret_status,
                value_ext2: error.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw error;
        }
    }
    
    // ============================================================================
    // 게임 삭제
    // ============================================================================
    
    async deleteGame(gameId, userId) {
        const LOG_HEADER_TITLE = "DELETE_GAME";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_game_load = -2;
        const catch_authorization = -3;
        const catch_procedure_call = -4;
        
        const EXT_data = {
            gameId: my_reqinfo.maskId(gameId),
            userId: my_reqinfo.maskId(userId)
        };
        
        try {
            //----------------------------------------------------------------------
            // 입력층: 입력 검증
            //----------------------------------------------------------------------
            try {
                this.validateGameId(gameId);
                this.validateUserId(userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Input validation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 기존 게임 정보 로드 (권한 확인용)
            //----------------------------------------------------------------------
            let existingGame;
            try {
                existingGame = await this.loadGame(gameId, userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_load);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_load_for_auth)",
                    value: catch_game_load,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Failed to verify game ownership: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 프로시저 호출 (게임 삭제)
            //----------------------------------------------------------------------
            let procedureResult;
            try {
                procedureResult = await callProcedure('pc_tgame_state_del', [gameId]);
                
                if (!procedureResult.success) {
                    throw new Error(procedureResult.message || "Game deletion failed");
                }
                
                if (procedureResult.code === 0) {
                    throw new Error("Game not found or already deleted");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_procedure_call);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(procedure_call)",
                    value: catch_procedure_call,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Database operation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 출력층: 결과 반환
            //----------------------------------------------------------------------
            const successResult = {
                game_id: gameId,
                deleted_at: new Date(),
                affected_rows: procedureResult.code
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { game_id: my_reqinfo.maskId(gameId), deleted_at: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (error) {
            // 예상치 못한 에러 처리
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -99,
                value_ext1: ret_status,
                value_ext2: error.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw error;
        }
    }
    
    // ============================================================================
    // 게임 상태 업데이트 (채팅 응답 반영)
    // ============================================================================
    
    async updateGameFromChat(gameId, userId, chatResponse) {
        const LOG_HEADER_TITLE = "UPDATE_GAME_FROM_CHAT";
        const LOG_HEADER = "GameId[" + my_reqinfo.maskId(gameId) + "] UserId[" + my_reqinfo.maskId(userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_game_load = -2;
        const catch_game_parsing = -3;
        const catch_game_save = -4;
        
        const EXT_data = {
            gameId: my_reqinfo.maskId(gameId),
            userId: my_reqinfo.maskId(userId),
            responseLength: chatResponse?.length || 0
        };
        
        try {
            //----------------------------------------------------------------------
            // 입력층: 입력 검증
            //----------------------------------------------------------------------
            try {
                this.validateGameId(gameId);
                this.validateUserId(userId);
                
                if (!chatResponse || typeof chatResponse !== 'string') {
                    throw new Error("Invalid chat response");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Input validation failed: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 기존 게임 상태 로드
            //----------------------------------------------------------------------
            let currentGame;
            try {
                currentGame = await this.loadGame(gameId, userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_load);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_load)",
                    value: catch_game_load,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Failed to load current game state: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 처리층: 채팅 응답에서 게임 상태 파싱
            //----------------------------------------------------------------------
            let updatedGameData;
            try {
                updatedGameData = this.parseGameStateFromChat(chatResponse, currentGame.game_data);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_parsing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_parsing)",
                    value: catch_game_parsing,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                // 파싱 실패 시 기존 게임 데이터 유지
                updatedGameData = currentGame.game_data;
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Using existing game data due to parsing failure");
            }
            
            //----------------------------------------------------------------------
            // 처리층: 게임 상태 저장
            //----------------------------------------------------------------------
            let saveResult;
            try {
                saveResult = await this.saveGame(gameId, updatedGameData, userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_save);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_save)",
                    value: catch_game_save,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error("Failed to save updated game state: " + e.message);
            }
            
            //----------------------------------------------------------------------
            // 출력층: 결과 반환
            //----------------------------------------------------------------------
            const successResult = {
                game_id: gameId,
                game_data: updatedGameData,
                updated_at: saveResult.saved_at
            };
            
            ret_data = {
                code: LOG_HEADER_TITLE + "(success)",
                value: 1,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { game_id: my_reqinfo.maskId(gameId), updated_at: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (error) {
            // 예상치 못한 에러 처리
            ret_status = fail_status;
            ret_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -99,
                value_ext1: ret_status,
                value_ext2: error.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw error;
        }
    }
    
    // ============================================================================
    // 채팅 응답에서 게임 상태 파싱
    // ============================================================================
    
    parseGameStateFromChat(chatResponse, currentGameData) {
        const LOG_HEADER_TITLE = "PARSE_GAME_STATE_FROM_CHAT";
        const LOG_HEADER = "GameService --> " + LOG_HEADER_TITLE;
        
        try {
            // 현재 게임 데이터를 기본값으로 시작
            let updatedGameData = JSON.parse(JSON.stringify(currentGameData));
            let hasUpdates = false;
            
            // STATS 섹션에서 게임 상태 파싱
            const statsPattern = /STATS[^=]*={3,}([\s\S]*?)(?=={3,}|$)/i;
            const statsMatch = chatResponse.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 플레이어 정보 파싱
                const healthMatch = statsContent.match(/체력[:\s]*(\d+)\/(\d+)/i);
                if (healthMatch) {
                    updatedGameData.player.health = parseInt(healthMatch[1]);
                    hasUpdates = true;
                }
                
                const levelMatch = statsContent.match(/레벨[:\s]*(\d+)/i);
                if (levelMatch) {
                    updatedGameData.player.level = parseInt(levelMatch[1]);
                    hasUpdates = true;
                }
                
                const expMatch = statsContent.match(/경험치[:\s]*(\d+)/i);
                if (expMatch) {
                    updatedGameData.player.exp = parseInt(expMatch[1]);
                    hasUpdates = true;
                }
                
                // 골드 파싱
                const goldMatch = statsContent.match(/골드[:\s]*(\d+)/i);
                if (goldMatch) {
                    updatedGameData.inventory.gold = parseInt(goldMatch[1]);
                    hasUpdates = true;
                }
            }
            
            // 위치 정보 파싱 (>> 위치: 형식)
            const locationPattern = />>\s*위치:\s*([^-\n]+?)(?:\s*-\s*([^\n]+))?/i;
            const locationMatch = chatResponse.match(locationPattern);
            
            if (locationMatch) {
                const newLocation = locationMatch[1].trim();
                if (newLocation && newLocation !== updatedGameData.location.current) {
                    updatedGameData.location.current = newLocation;
                    
                    // 발견된 위치 목록에 추가
                    if (!updatedGameData.location.discovered.includes(newLocation)) {
                        updatedGameData.location.discovered.push(newLocation);
                    }
                    hasUpdates = true;
                }
            }
            
            // 상태 정보 파싱 (상태: 형식)
            const statusPattern = />>\s*상태:\s*([^\n]+)/i;
            const statusMatch = chatResponse.match(statusPattern);
            
            if (statusMatch) {
                const newStatus = statusMatch[1].trim();
                if (newStatus) {
                    updatedGameData.player.status = newStatus;
                    hasUpdates = true;
                }
            }
            
            // 아이템 획득 파싱
            const itemGainPattern = /\[([^\]]+)\](?:을|를)\s*획득/gi;
            let itemMatch;
            while ((itemMatch = itemGainPattern.exec(chatResponse)) !== null) {
                const itemName = itemMatch[1].trim();
                if (itemName && !updatedGameData.inventory.items.includes(itemName)) {
                    updatedGameData.inventory.items.push(itemName);
                    hasUpdates = true;
                }
            }
            
            if (hasUpdates) {
                console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + " Game state updated from chat response");
                return this.normalizeGameData(updatedGameData);
            } else {
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " No game state changes detected");
                return currentGameData;
            }
            
        } catch (e) {
            const ret_data = {
                code: LOG_HEADER_TITLE + "(parsing_error)",
                value: -1,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data: { responseLength: chatResponse?.length || 0 }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            // 파싱 실패 시 원본 데이터 반환
            return currentGameData;
        }
    }
}

module.exports = new GameService();
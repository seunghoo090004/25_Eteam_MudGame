// routes/socket/handlers/game.js
// 게임 상태 변경 이벤트 처리 (새 게임, 저장, 로드) - 레퍼런스 패턴 적용

'use strict';
const gameService = require('../services/game');
const chatService = require('../services/chat');
const my_reqinfo = require('../../../utils/reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

const gameHandler = (io, socket) => {
    
    //============================================================================================
    socket.on('new game', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "NEW_GAME";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] AssistantId[" + my_reqinfo.maskId(data?.assistant_id) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_input_validation = -2;
        const catch_game_service = -3;
        const catch_chat_service = -4;
        const catch_games_list = -5;
        
        const EXT_data = {
            socketId: socket.id,
            sessionUserId: socket.request.session.userId,
            assistantId: data?.assistant_id
        };
        
        try {
            //----------------------------------------------------------------------
            // 인증 확인
            //----------------------------------------------------------------------
            let userId;
            try {
                userId = socket.request.session.userId;
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_auth);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(authentication)",
                    value: catch_auth,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('new game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 입력값 검증
            //----------------------------------------------------------------------
            let assistantId;
            try {
                if (!data || !data.assistant_id) {
                    throw new Error("Assistant ID required");
                }
                assistantId = data.assistant_id;
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
                
                socket.emit('new game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 생성
            //----------------------------------------------------------------------
            let game;
            try {
                game = await gameService.createNewGame(userId, assistantId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_service_create)",
                    value: catch_game_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('new game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 초기 채팅 응답 생성
            //----------------------------------------------------------------------
            let initialResponse;
            try {
                initialResponse = await chatService.initializeChat(game.threadId, assistantId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_chat_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(chat_service_initialize)",
                    value: catch_chat_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('new game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 새 게임 생성 응답
            //----------------------------------------------------------------------
            socket.emit('new game response', {
                success: true,
                game_id: game.gameId,
                game_data: game.gameData,
                initial_message: initialResponse
            });
            
            //----------------------------------------------------------------------
            // 게임 목록 업데이트
            //----------------------------------------------------------------------
            try {
                const updatedGames = await gameService.listGames(userId);
                socket.emit('games list response', {
                    success: true,
                    games: updatedGames
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_games_list);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(games_list_update)",
                    value: catch_games_list,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                // 게임 목록 업데이트 실패는 경고로만 처리
            }
            
            //----------------------------------------------------------------------
            // result - 성공 로깅
            //----------------------------------------------------------------------
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    gameId: game.gameId,
                    threadId: my_reqinfo.maskId(game.threadId),
                    initialResponseLength: initialResponse?.length || 0
                },
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
        } catch (e) {
            // 예상치 못한 오류 처리
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            
            socket.emit('new game response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });

    //============================================================================================
    socket.on('load game', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "LOAD_GAME";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] GameId[" + my_reqinfo.maskId(data?.game_id) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_input_validation = -2;
        const catch_game_service = -3;
        const catch_chat_service = -4;
        
        const EXT_data = {
            socketId: socket.id,
            sessionUserId: socket.request.session.userId,
            gameId: data?.game_id
        };
        
        try {
            //----------------------------------------------------------------------
            // 인증 확인
            //----------------------------------------------------------------------
            let userId;
            try {
                userId = socket.request.session.userId;
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_auth);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(authentication)",
                    value: catch_auth,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('load game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 입력값 검증
            //----------------------------------------------------------------------
            let gameId;
            try {
                if (!data || !data.game_id) {
                    throw new Error("Game ID required");
                }
                gameId = data.game_id;
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
                
                socket.emit('load game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 데이터 로드
            //----------------------------------------------------------------------
            let gameData;
            try {
                gameData = await gameService.loadGame(gameId, userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_service_load)",
                    value: catch_game_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('load game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 초기 응답 생성 (필요시)
            //----------------------------------------------------------------------
            try {
                // 채팅 히스토리가 비어있거나 마지막 메시지가 사용자 메시지인 경우 초기 응답 생성
                if (!gameData.chatHistory || gameData.chatHistory.length === 0 || 
                    gameData.chatHistory[gameData.chatHistory.length - 1].role === 'user') {
                    
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Generating initial response for loaded game");
                    const initialResponse = await chatService.sendMessage(
                        gameData.thread_id, 
                        gameData.assistant_id,
                        "이전 대화를 기반으로 게임을 계속 진행해 주세요."
                    );
                    
                    if (!gameData.chatHistory) gameData.chatHistory = [];
                    
                    // 새 응답을 채팅 히스토리에 추가
                    gameData.chatHistory.push({
                        role: 'assistant',
                        content: initialResponse,
                        created_at: new Date()
                    });
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_chat_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(chat_service_initial)",
                    value: catch_chat_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                // 초기 응답 생성 실패는 경고로만 처리하고 계속 진행
            }
            
            //----------------------------------------------------------------------
            // 게임 로드 응답
            //----------------------------------------------------------------------
            socket.emit('load game response', {
                success: true,
                game: gameData
            });
            
            //----------------------------------------------------------------------
            // result - 성공 로깅
            //----------------------------------------------------------------------
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    gameId: gameId,
                    threadId: my_reqinfo.maskId(gameData.thread_id),
                    chatHistoryLength: gameData.chatHistory?.length || 0
                },
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
        } catch (e) {
            // 예상치 못한 오류 처리
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            
            socket.emit('load game response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });

    //============================================================================================
    socket.on('save game', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "SAVE_GAME";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] GameId[" + my_reqinfo.maskId(data?.game_id) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_input_validation = -2;
        const catch_data_processing = -3;
        const catch_game_service = -4;
        const catch_games_list = -5;
        
        const EXT_data = {
            socketId: socket.id,
            sessionUserId: socket.request.session.userId,
            gameId: data?.game_id,
            gameDataType: typeof data?.game_data
        };
        
        try {
            //----------------------------------------------------------------------
            // 인증 확인
            //----------------------------------------------------------------------
            let userId;
            try {
                userId = socket.request.session.userId;
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_auth);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(authentication)",
                    value: catch_auth,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('save game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 입력값 검증
            //----------------------------------------------------------------------
            let gameId, gameData;
            try {
                if (!data || !data.game_id) {
                    throw new Error("Game ID required");
                }
                if (!data.game_data) {
                    throw new Error("Game data required");
                }
                gameId = data.game_id;
                gameData = data.game_data;
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
                
                socket.emit('save game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 데이터 전처리
            //----------------------------------------------------------------------
            let gameDataToSave;
            try {
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " 전달 받은 데이터 타입: " + typeof gameData);
                
                // 데이터가 문자열이 아닌 경우 문자열로 변환
                gameDataToSave = gameData;
                if (typeof gameDataToSave !== 'string') {
                    gameDataToSave = JSON.stringify(gameDataToSave);
                }
                
                // JSON 유효성 검사
                JSON.parse(gameDataToSave);
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
                
                socket.emit('save game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 저장 진행 알림
            //----------------------------------------------------------------------
            socket.emit('save game progress', {
                status: 'saving',
                message: '게임을 저장하는 중입니다...'
            });
            
            //----------------------------------------------------------------------
            // 게임 저장
            //----------------------------------------------------------------------
            let result;
            try {
                result = await gameService.saveGame(gameId, userId, gameDataToSave);
                
                if (!result.success) {
                    throw new Error(result.error || "Unknown error");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_service_save)",
                    value: catch_game_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('save game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 목록 업데이트
            //----------------------------------------------------------------------
            try {
                const updatedGames = await gameService.listGames(userId);
                socket.emit('games list response', {
                    success: true,
                    games: updatedGames
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_games_list);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(games_list_update)",
                    value: catch_games_list,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                // 게임 목록 업데이트 실패는 경고로만 처리
            }
            
            //----------------------------------------------------------------------
            // 저장 성공 응답
            //----------------------------------------------------------------------
            socket.emit('save game response', {
                success: true,
                threadChanged: true,
                summary: result.summary,
                extractedLocation: result.extractedLocation,
                initialResponse: result.initialResponse
            });
            
            //----------------------------------------------------------------------
            // result - 성공 로깅
            //----------------------------------------------------------------------
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    gameId: gameId,
                    summaryLength: result.summary?.length || 0,
                    threadChanged: true
                },
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
        } catch (e) {
            // 예상치 못한 오류 처리
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            
            socket.emit('save game response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });
    
    //============================================================================================
    socket.on('get games list', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "GET_GAMES_LIST";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_game_service = -2;
        
        const EXT_data = {
            socketId: socket.id,
            sessionUserId: socket.request.session.userId,
            forceRefresh: data?.forceRefresh || false
        };
        
        try {
            //----------------------------------------------------------------------
            // 인증 확인
            //----------------------------------------------------------------------
            let userId;
            try {
                userId = socket.request.session.userId;
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_auth);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(authentication)",
                    value: catch_auth,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('games list response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 강제 갱신 확인
            //----------------------------------------------------------------------
            const forceRefresh = data && data.forceRefresh === true;
            if (forceRefresh) {
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " 강제 갱신으로 게임 목록 요청됨");
            }
            
            //----------------------------------------------------------------------
            // 게임 목록 가져오기
            //----------------------------------------------------------------------
            let games;
            try {
                games = await gameService.listGames(userId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_game_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(game_service_list)",
                    value: catch_game_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('games list response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 목록 응답
            //----------------------------------------------------------------------
            socket.emit('games list response', {
                success: true,
                games: games,
                forceRefresh: forceRefresh
            });
            
            //----------------------------------------------------------------------
            // result - 성공 로깅
            //----------------------------------------------------------------------
            ret_data = {
                code: "result",
                value: games.length,
                value_ext1: ret_status,
                value_ext2: {
                    gamesCount: games.length,
                    forceRefresh: forceRefresh
                },
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
        } catch (e) {
            // 예상치 못한 오류 처리
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            
            socket.emit('games list response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });

    //============================================================================================
    socket.on('delete game', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "DELETE_GAME";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] GameId[" + my_reqinfo.maskId(data?.game_id) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_input_validation = -2;
        const catch_game_service = -3;
        
        const EXT_data = {
            socketId: socket.id,
            sessionUserId: socket.request.session.userId,
            gameId: data?.game_id
        };
        
        try {
            //----------------------------------------------------------------------
            // 인증 확인
            //----------------------------------------------------------------------
            let userId;
            try {
                userId = socket.request.session.userId;
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_auth);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(authentication)",
                    value: catch_auth,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('delete game response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 삭제 응답
            //----------------------------------------------------------------------
            socket.emit('delete game response', {
                success: true,
                game_id: gameId
            });
            
            //----------------------------------------------------------------------
            // result - 성공 로깅
            //----------------------------------------------------------------------
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    gameId: gameId,
                    deleted: true
                },
                EXT_data
            };
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
        } catch (e) {
            // 예상치 못한 오류 처리
            const error_data = {
                code: LOG_HEADER_TITLE + "(unexpected_error)",
                value: -999,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            
            socket.emit('delete game response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });
};

module.exports = gameHandler;
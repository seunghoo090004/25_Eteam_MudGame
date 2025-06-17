// routes/socket/handlers/chat.js
// 채팅 이벤트 처리 (메시지 전송, 응답 생성) - 레퍼런스 패턴 적용

'use strict';
const chatService = require('../services/chat');
const gameService = require('../services/game');
const my_reqinfo = require('../../../utils/reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

const chatHandler = (io, socket) => {
    
    //============================================================================================
    socket.on('chat message', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "CHAT_MESSAGE";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] GameId[" + my_reqinfo.maskId(data?.game_id) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_input_validation = -2;
        const catch_game_load = -3;
        const catch_chat_service = -4;
        const catch_game_parsing = -5;
        const catch_game_update = -6;
        
        const EXT_data = {
            socketId: socket.id,
            sessionUserId: socket.request.session.userId,
            gameId: data?.game_id,
            messageLength: data?.message?.length || 0
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
                
                socket.emit('chat response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 입력값 검증
            //----------------------------------------------------------------------
            let gameId, message;
            try {
                if (!data || !data.game_id) {
                    throw new Error("Game ID required");
                }
                if (!data.message) {
                    throw new Error("Message required");
                }
                gameId = data.game_id;
                message = data.message;
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
                
                socket.emit('chat response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 정보 로드
            //----------------------------------------------------------------------
            let game;
            try {
                game = await gameService.loadGame(gameId, userId);
                if (!game || !game.thread_id || !game.assistant_id) {
                    throw new Error("Invalid game data");
                }
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
                
                socket.emit('chat response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // AI 응답 생성
            //----------------------------------------------------------------------
            let aiResponse;
            try {
                aiResponse = await chatService.sendMessage(game.thread_id, game.assistant_id, message);
                if (!aiResponse) {
                    throw new Error("Empty response from AI");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_chat_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(chat_service)",
                    value: catch_chat_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('chat response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 상태 파싱
            //----------------------------------------------------------------------
            let updatedGameState = null;
            try {
                const parsedState = chatService.parseGameResponse(aiResponse);
                if (parsedState && game.game_data) {
                    // 기존 게임 데이터를 업데이트
                    updatedGameState = { ...game.game_data };
                    
                    // 파싱된 상태로 업데이트
                    if (parsedState.location && parsedState.location.current) {
                        updatedGameState.location = updatedGameState.location || {};
                        updatedGameState.location.current = parsedState.location.current;
                        
                        if (parsedState.location.roomId) {
                            updatedGameState.location.roomId = parsedState.location.roomId;
                        }
                        
                        // 발견된 위치 목록 업데이트
                        if (!updatedGameState.location.discovered) {
                            updatedGameState.location.discovered = [];
                        }
                        if (!updatedGameState.location.discovered.includes(parsedState.location.current)) {
                            updatedGameState.location.discovered.push(parsedState.location.current);
                        }
                    }
                    
                    // 플레이어 상태 업데이트
                    if (parsedState.player) {
                        updatedGameState.player = updatedGameState.player || {};
                        Object.assign(updatedGameState.player, parsedState.player);
                    }
                    
                    // 인벤토리 업데이트
                    if (parsedState.inventory) {
                        updatedGameState.inventory = updatedGameState.inventory || {};
                        Object.assign(updatedGameState.inventory, parsedState.inventory);
                    }
                }
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
                // 파싱 실패는 경고로만 처리하고 계속 진행
            }
            
            //----------------------------------------------------------------------
            // 게임 상태 업데이트 (선택적)
            //----------------------------------------------------------------------
            if (updatedGameState) {
                try {
                    await chatService.updateGameContext(game.thread_id, updatedGameState);
                } catch (e) {
                    ret_status = fail_status + (-1 * catch_game_update);
                    ret_data = {
                        code: LOG_HEADER_TITLE + "(game_update)",
                        value: catch_game_update,
                        value_ext1: ret_status,
                        value_ext2: e.message,
                        EXT_data
                    };
                    console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                    // 게임 상태 업데이트 실패는 경고로만 처리
                }
            }
            
            //----------------------------------------------------------------------
            // 채팅 응답
            //----------------------------------------------------------------------
            socket.emit('chat response', {
                success: true,
                response: aiResponse,
                game_state: updatedGameState || game.game_data
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
                    threadId: my_reqinfo.maskId(game.thread_id),
                    messageLength: message.length,
                    responseLength: aiResponse.length,
                    gameStateUpdated: updatedGameState !== null
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
            
            socket.emit('chat response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });

    //============================================================================================
    socket.on('get chat history', async (data) => {
    //============================================================================================
        const LOG_HEADER_TITLE = "GET_CHAT_HISTORY";
        const LOG_HEADER = "UserId[" + my_reqinfo.maskId(socket.request.session.userId) + "] GameId[" + my_reqinfo.maskId(data?.game_id) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_auth = -1;
        const catch_input_validation = -2;
        const catch_game_load = -3;
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
                
                socket.emit('chat history response', {
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
                
                socket.emit('chat history response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 게임 정보 로드
            //----------------------------------------------------------------------
            let game;
            try {
                game = await gameService.loadGame(gameId, userId);
                if (!game || !game.thread_id) {
                    throw new Error("Invalid game data or thread not found");
                }
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
                
                socket.emit('chat history response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 채팅 히스토리 가져오기
            //----------------------------------------------------------------------
            let history;
            try {
                history = await chatService.getMessageHistory(game.thread_id);
                if (!Array.isArray(history)) {
                    history = [];
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_chat_service);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(chat_service_history)",
                    value: catch_chat_service,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                socket.emit('chat history response', {
                    success: false,
                    error: ret_data.value_ext2
                });
                return;
            }
            
            //----------------------------------------------------------------------
            // 채팅 히스토리 응답
            //----------------------------------------------------------------------
            socket.emit('chat history response', {
                success: true,
                history: history
            });
            
            //----------------------------------------------------------------------
            // result - 성공 로깅
            //----------------------------------------------------------------------
            ret_data = {
                code: "result",
                value: history.length,
                value_ext1: ret_status,
                value_ext2: {
                    gameId: gameId,
                    threadId: my_reqinfo.maskId(game.thread_id),
                    historyLength: history.length
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
            
            socket.emit('chat history response', {
                success: false,
                error: error_data.value_ext2
            });
        }
    });
};

module.exports = chatHandler;
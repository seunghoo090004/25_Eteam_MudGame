// routes/socket/handlers/chat.js - 발견 추적 및 조건부 이미지 생성

const gameService = require('../services/game');
const chatService = require('../services/chat');
const { generateImageFromText, extractImageKeywords, createImagePrompt } = require('../../../utils/gptUtils');

const chatHandler = (io, socket) => {
    socket.on('chat message', async (data) => {
        const LOG_HEADER = "SOCKET/CHAT_MESSAGE";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
            if (!data.message) throw new Error("Message required");

            let safeMessage = data.message;
            if (typeof safeMessage !== 'string') {
                safeMessage = String(safeMessage);
            }

            const game = await gameService.loadGameForSocket(data.game_id, userId);
            
            const aiResponse = await chatService.sendMessage(
                game.thread_id,
                game.assistant_id,
                safeMessage
            );

            let updatedGameData = JSON.parse(JSON.stringify(game.game_data));
            
            const parsedState = chatService.parseGameResponse(aiResponse);
            
            // 기존 발견 목록 백업 (이미지 생성 결정용)
            const previousDiscoveries = [...(updatedGameData.discoveries || [])];
            
            if (parsedState) {
                if (parsedState.location && parsedState.location.current) {
                    if (!updatedGameData.location) {
                        updatedGameData.location = {};
                    }
                    
                    updatedGameData.location.current = parsedState.location.current;
                    
                    if (parsedState.location.roomId) {
                        updatedGameData.location.roomId = parsedState.location.roomId;
                    }
                }

                if (parsedState.turn_count && parsedState.turn_count > 0) {
                    updatedGameData.turn_count = parsedState.turn_count;
                }

                if (parsedState.discoveries && parsedState.discoveries.length > 0) {
                    if (!updatedGameData.discoveries) {
                        updatedGameData.discoveries = [];
                    }
                    
                    // 새로운 발견만 추가
                    parsedState.discoveries.forEach(discovery => {
                        if (!updatedGameData.discoveries.includes(discovery)) {
                            updatedGameData.discoveries.push(discovery);
                            console.log(`[${LOG_HEADER}] New discovery added: ${discovery}`);
                        }
                    });
                }

                if (parsedState.death_count !== undefined) {
                    updatedGameData.death_count = parsedState.death_count;
                }

                if (parsedState.progress) {
                    if (!updatedGameData.progress) {
                        updatedGameData.progress = {};
                    }
                    Object.assign(updatedGameData.progress, parsedState.progress);
                }
            }

            await gameService.updateGameDataForSocket(data.game_id, userId, updatedGameData);

            socket.emit('chat response', {
                success: true,
                message: aiResponse,
                game_data: updatedGameData
            });
            
            // 이미지 생성 시작 신호 전송 (UI 버튼 비활성화용)
            socket.emit('image generating', {
                game_id: data.game_id,
                status: 'started'
            });

            // AI 응답에서 상황 묘사 추출 - gameData 전달로 조건부 생성
            const sceneResult = extractImageKeywords(aiResponse, {
                ...updatedGameData,
                previousDiscoveries: previousDiscoveries  // 이전 발견 목록 전달
            });
            
            if (sceneResult.shouldGenerate) {
                console.log(`[${LOG_HEADER}] Image generation triggered - Reason: ${sceneResult.reason}`);
                if (sceneResult.discoveries) {
                    console.log(`[${LOG_HEADER}] New discoveries: ${sceneResult.discoveries.join(', ')}`);
                }
                
                // 이미지 프롬프트 생성
                const imagePrompt = createImagePrompt(sceneResult, updatedGameData);
                
                // 이미지 생성 옵션
                const imageOptions = {
                    model: 'gpt-image-1',
                    quality: 'medium',
                    size: '1024x1024',
                    format: 'png',
                    background: 'opaque'
                };
                
                // 이미지 생성 실행
                const imageResult = await generateImageFromText(imagePrompt, imageOptions);
                
                if (imageResult.success) {
                    console.log(`[${LOG_HEADER}] Image generation completed successfully`);
                    
                    // 이미지 완료 신호 + 데이터 전송
                    socket.emit('image ready', {
                        game_id: data.game_id,
                        success: true,
                        image_data: {
                            base64: imageResult.image_base64,
                            format: imageResult.format,
                            prompt: imagePrompt,
                            revised_prompt: imageResult.revised_prompt,
                            sceneDescription: sceneResult.sceneDescription,
                            trigger_reason: sceneResult.reason,
                            new_discoveries: sceneResult.discoveries
                        }
                    });
                } else {
                    console.error(`[${LOG_HEADER}] Image generation failed:`, imageResult.error);
                    
                    // 이미지 생성 실패 신호
                    socket.emit('image error', {
                        game_id: data.game_id,
                        success: false,
                        error: imageResult.error,
                        error_type: imageResult.error_type
                    });
                }
            } else {
                console.log(`[${LOG_HEADER}] Image generation skipped - Reason: ${sceneResult.reason}`);
                
                // 이미지 생성 건너뜀 신호 (UI 복원용)
                socket.emit('image skipped', {
                    game_id: data.game_id,
                    reason: sceneResult.reason,
                    message: '새로운 발견이 없어 이미지가 생성되지 않았습니다.'
                });
            }
            
            // 엔딩 조건 체크
            const endingCondition = gameService.checkEndingConditions(updatedGameData, aiResponse);
            
            if (endingCondition) {
                console.log(`[${LOG_HEADER}] Ending detected:`, endingCondition.type);
                
                const endingData = {
                    ending_type: endingCondition.type,
                    final_turn: updatedGameData.turn_count || 1,
                    total_deaths: updatedGameData.death_count || 0,
                    discoveries: updatedGameData.discoveries || [],
                    ending_story: endingCondition.story,
                    cause_of_death: endingCondition.cause,
                    game_data: updatedGameData,
                    game_started: game.created_at
                };
                
                socket.emit('game ending', {
                    success: true,
                    ending_data: endingData
                });
            }
            
        } catch (error) {
            console.error(`[${LOG_HEADER}] Error:`, error);
            socket.emit('chat response', {
                success: false,
                error: error.message || 'Failed to process message'
            });
        }
    });
    
    // 채팅 기록 가져오기
    socket.on('get chat history', async (data) => {
        const LOG_HEADER = "SOCKET/GET_CHAT_HISTORY";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");
            
            const history = await chatService.getChatHistory(data.game_id, userId);
            
            socket.emit('chat history', {
                success: true,
                history: history
            });
            
        } catch (error) {
            console.error(`[${LOG_HEADER}] Error:`, error);
            socket.emit('chat history', {
                success: false,
                error: error.message || 'Failed to get chat history'
            });
        }
    });
};

module.exports = chatHandler;
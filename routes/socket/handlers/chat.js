// routes/socket/handlers/chat.js - 새로운 발견 시에만 이미지 생성

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
            
            // ✅ 이전 발견 목록 저장 (비교용)
            const previousDiscoveries = updatedGameData.discoveries || [];
            let hasNewDiscovery = false;
            let newDiscoveries = [];
            
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

                // ✅ 새로운 발견 체크
                if (parsedState.discoveries && parsedState.discoveries.length > 0) {
                    if (!updatedGameData.discoveries) {
                        updatedGameData.discoveries = [];
                    }
                    
                    // 새로운 발견만 필터링
                    parsedState.discoveries.forEach(discovery => {
                        // "없음"이 아니고, 이전에 없던 발견인 경우
                        if (discovery !== "없음" && !previousDiscoveries.includes(discovery)) {
                            newDiscoveries.push(discovery);
                            hasNewDiscovery = true;
                        }
                    });
                    
                    // 새로운 발견들을 기존 목록에 추가 (중복 제거)
                    if (hasNewDiscovery) {
                        updatedGameData.discoveries = [...new Set([...previousDiscoveries, ...newDiscoveries])];
                    }
                }

                if (parsedState.game_status) {
                    updatedGameData.game_status = parsedState.game_status;
                }

                if (parsedState.death_count !== undefined) {
                    updatedGameData.death_count = parsedState.death_count;
                }

                if (parsedState.is_death === true) {
                    updatedGameData.is_completed = true;
                    if (parsedState.death_cause) {
                        updatedGameData.death_cause = parsedState.death_cause;
                    }
                }

                if (parsedState.is_escape === true) {
                    updatedGameData.is_completed = true;
                    updatedGameData.is_escape = true;
                }

                if (!updatedGameData.time_elapsed) {
                    updatedGameData.time_elapsed = 0;
                }
                updatedGameData.time_elapsed += Math.floor(Math.random() * 2) + 2;
            }

            // 1. 텍스트 응답 즉시 전송
            socket.emit('chat response', {
                success: true,
                response: aiResponse,
                game_state: updatedGameData
            });

            // ✅ 2. 이미지 생성 조건 체크
            const imageKeywords = [
                '조우',           // 몬스터 조우
                '발견',           // 아이템 발견
                '차원 감옥 시작', // 게임 시작
                '탈출 성공',      // 게임 클리어
                '사망'            // 사망
            ];
            
            // 새로운 발견이 있거나 키워드가 있을 때만 이미지 생성
            const shouldGenerateImage = hasNewDiscovery || 
                                       imageKeywords.some(keyword => aiResponse.includes(keyword));
            
            if (shouldGenerateImage) {
                console.log(`[${LOG_HEADER}] New discovery or keyword detected:`, {
                    hasNewDiscovery,
                    newDiscoveries,
                    keywordFound: imageKeywords.some(keyword => aiResponse.includes(keyword))
                });
                processImageGeneration(socket, aiResponse, updatedGameData, data.game_id);
            } else {
                console.log(`[${LOG_HEADER}] No new discovery, skipping image generation`);
                socket.emit('image skipped', {
                    game_id: data.game_id,
                    reason: 'no_new_discovery'
                });
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('chat response', {
                success: false,
                error: e.message || e
            });
        }
    });

    // 이미지 생성 처리 함수
    async function processImageGeneration(socket, aiResponse, gameData, gameId) {
        const LOG_HEADER = "SOCKET/IMAGE_GENERATION";
        
        try {
            console.log(`[${LOG_HEADER}] Starting image generation for new discovery`);
            
            // 이미지 생성 시작 신호
            socket.emit('image generating', {
                game_id: gameId,
                status: 'started',
                message: '새로운 발견! 이미지 생성 중...'
            });

            // AI 응답에서 상황 묘사 추출
            const sceneResult = extractImageKeywords(aiResponse);
            
            if (sceneResult.shouldGenerate) {
                console.log(`[${LOG_HEADER}] Scene description found:`, sceneResult.sceneDescription.substring(0, 100) + "...");
                
                // 이미지 프롬프트 생성
                const imagePrompt = createImagePrompt(sceneResult, gameData);
                
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
                        game_id: gameId,
                        success: true,
                        image_data: {
                            base64: imageResult.image_base64,
                            format: imageResult.format,
                            prompt: imagePrompt,
                            revised_prompt: imageResult.revised_prompt,
                            sceneDescription: sceneResult.sceneDescription
                        }
                    });
                } else {
                    console.error(`[${LOG_HEADER}] Image generation failed:`, imageResult.error);
                    
                    // 이미지 생성 실패 신호
                    socket.emit('image error', {
                        game_id: gameId,
                        success: false,
                        error: imageResult.error,
                        error_type: imageResult.error_type
                    });
                }
            } else {
                console.log(`[${LOG_HEADER}] No image keywords found, skipping image generation`);
                
                // 이미지 생성 스킵 신호
                socket.emit('image skipped', {
                    game_id: gameId,
                    reason: 'no_keywords'
                });
            }
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            
            // 이미지 생성 에러 신호
            socket.emit('image error', {
                game_id: gameId,
                success: false,
                error: e.message || 'Image generation failed',
                error_type: 'processing_error'
            });
        }
    }

    // 채팅 히스토리 기능
    socket.on('get chat history', async (data) => {
        const LOG_HEADER = "SOCKET/CHAT_HISTORY";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw new Error("Not authenticated");
            if (!data.game_id) throw new Error("Game ID required");

            const game = await gameService.loadGameForSocket(data.game_id, userId);
            
            let history;
            try {
                history = await chatService.getMessageHistory(game.thread_id);
            } catch (historyError) {
                console.error(`[${LOG_HEADER}] History retrieval error:`, historyError);
                history = [];
            }
            
            socket.emit('chat history response', {
                success: true,
                history: history
            });

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('chat history response', {
                success: false,
                error: e.message || e
            });
        }
    });
};

module.exports = chatHandler;
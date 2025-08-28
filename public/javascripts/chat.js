// public/javascripts/chat.js - 이미지 표시 기능 추가

const GameChat = (function() {
    // 이미지 트리거 감지 클래스
    class ImageTriggerDetector {
        constructor() {
            this.triggers = {
                gameStart: ['차원 감옥 시작', '던전 시작', '게임 시작'],
                monsterEncounter: ['조우'],
                itemDiscovery: ['발견'],
                death: ['죽었습니다', '사망'],
                escape: ['탈출 성공', '탈출했습니다']
            };
        }

        detectTrigger(message) {
            // 게임 시작 체크
            if (this.triggers.gameStart.some(trigger => message.includes(trigger))) {
                return { type: 'game_start', detected: true };
            }
            
            // 몬스터 조우 체크
            if (message.includes('조우')) {
                const monsters = ['고블린', '스켈레톤', '슬라임', '오크', '트롤', 
                                '미노타우로스', '리치', '데몬', '뱀파이어', '드래곤'];
                const encounteredMonster = monsters.find(m => message.includes(m));
                if (encounteredMonster) {
                    return { type: 'monster_encounter', detected: true, monster: encounteredMonster };
                }
            }
            
            // 아이템 발견 체크
            if (message.includes('발견')) {
                const items = ['단검', '횃불', '병', '방패', '창', '판자'];
                const foundItem = items.find(i => message.includes(i));
                if (foundItem) {
                    return { type: 'item_discovery', detected: true, item: foundItem };
                }
            }
            
            // 사망 체크
            if (this.triggers.death.some(trigger => message.includes(trigger))) {
                return { type: 'death', detected: true };
            }
            
            // 탈출 체크
            if (this.triggers.escape.some(trigger => message.includes(trigger))) {
                return { type: 'escape', detected: true };
            }
            
            return { detected: false };
        }
    }

    // 게임 통계 관리 클래스
    class GameStatistics {
        constructor() {
            this.currentStats = {
                turn: 1,
                location: '시작의 방',
                discovery: '없음'
            };
            this.lastDiscoveryTurn = 0;
            this.lastDiscoveredEntity = null;
        }

        updateStats(turn, location, newDiscovery = null) {
            this.currentStats.turn = turn;
            this.currentStats.location = location;
            
            // 발견 항목 처리 - 최초 발견 시에만 표시, 다음 턴부터는 무조건 "없음"
            if (newDiscovery && newDiscovery !== this.lastDiscoveredEntity) {
                // 새로운 엔티티 발견 시
                this.currentStats.discovery = newDiscovery;
                this.lastDiscoveryTurn = turn;
                this.lastDiscoveredEntity = newDiscovery;
            } else if (turn > this.lastDiscoveryTurn) {
                // 턴이 넘어가면 무조건 "없음"
                this.currentStats.discovery = '없음';
            }
        }

        generateStatsBox() {
            return `통계
===============================================
턴: ${this.currentStats.turn}
위치: ${this.currentStats.location}
발견: ${this.currentStats.discovery}
===============================================`;
        }

        parseDiscovery(message) {
            // 몬스터 처치/조우
            const monsters = ['고블린', '스켈레톤', '슬라임', '오크', '트롤', 
                            '미노타우로스', '리치', '데몬', '뱀파이어', '드래곤'];
            for (const monster of monsters) {
                if (message.includes(monster) && message.includes('조우')) {
                    return monster;
                }
            }
            
            // 아이템 발견
            const items = ['부러진 단검', '썩은 횃불', '깨진 병', '부서진 방패', '부러진 창', '썩은 나무 판자'];
            for (const item of items) {
                if (message.includes(item) && message.includes('발견')) {
                    return item;
                }
            }
            
            return null;
        }
    }

    // 전역 인스턴스
    const imageDetector = new ImageTriggerDetector();
    const gameStats = new GameStatistics();
    
    // 헬퍼 함수들
    function extractTurnFromMessage(message) {
        const turnMatch = message.match(/턴:\s*(\d+)/);
        return turnMatch ? parseInt(turnMatch[1]) : gameStats.currentStats.turn;
    }

    function extractLocationFromMessage(message) {
        const locationMatch = message.match(/위치:\s*([^\n]+)/);
        return locationMatch ? locationMatch[1].trim() : gameStats.currentStats.location;
    }

    function updateMessageStats(message, newStatsBox) {
        // 기존 통계 박스를 새로운 것으로 교체 (시간 항목 제거)
        const statsRegex = /통계[\s\S]*?={10,}/;
        if (statsRegex.test(message)) {
            return message.replace(statsRegex, newStatsBox);
        }
        return message;
    }
    
    function initialize() {
        setupEventHandlers();
    }
    
    function setupEventHandlers() {
        // 기존 채팅 관련 이벤트 핸들러
        $(document).on('chat:history', handleChatHistory);
        $(document).on('chat:response', handleChatResponse);
        
        // 이미지 관련 이벤트 핸들러
        $(document).on('image:ready', handleImageReady);
        $(document).on('image:error', handleImageError);
    }
    
    // 채팅 응답 처리 (추가)
    function handleChatResponse(event, data) {
        if (data.success && data.message) {
            // 이미지 트리거 감지
            const trigger = imageDetector.detectTrigger(data.message);
            
            if (trigger.detected) {
                console.log(`Image trigger detected: ${trigger.type}`);
                
                // 서버에 이미지 트리거 알림
                if (GameSocket && GameSocket.isConnected()) {
                    GameSocket.emit('check_image_trigger', {
                        game_id: GameState.getCurrentGameId(),
                        trigger_type: trigger.type,
                        context: {
                            monster: trigger.monster,
                            item: trigger.item,
                            turn: gameStats.currentStats.turn,
                            location: gameStats.currentStats.location
                        }
                    });
                }
            }
            
            // 통계 업데이트
            const turn = extractTurnFromMessage(data.message);
            const location = extractLocationFromMessage(data.message);
            const discovery = gameStats.parseDiscovery(data.message);
            
            gameStats.updateStats(turn, location, discovery);
            
            // 메시지 통계 업데이트 (시간 제거)
            const updatedMessage = updateMessageStats(data.message, gameStats.generateStatsBox());
            
            // UI 업데이트
            const messageClass = 'assistant-message';
            $('#chatbox').append(`<div class="message ${messageClass}">${updatedMessage}</div>`);
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
        }
    }
    
    // 채팅 메시지 전송
    function sendMessage(message) {
        if (!GameSocket.isConnected()) {
            console.error('소켓 연결이 끊어져 메시지를 보낼 수 없습니다.');
            return false;
        }
        
        const currentGameId = GameState.getCurrentGameId();
        if (!currentGameId) {
            console.error('현재 게임이 없어 메시지를 보낼 수 없습니다.');
            return false;
        }
        
        GameSocket.emit('chat message', {
            message: message,
            game_id: currentGameId
        });
        
        return true;
    }
    
    // 채팅 기록 요청
    function getChatHistory() {
        const currentGameId = GameState.getCurrentGameId();
        if (!currentGameId) {
            console.error('현재 게임이 없어 채팅 기록을 가져올 수 없습니다.');
            return false;
        }
        
        GameSocket.emit('get chat history', {
            game_id: currentGameId
        });
        
        return true;
    }
    
    // 채팅 기록 응답 처리
    function handleChatHistory(event, data) {
        if (data.success) {
            const history = data.history;
            
            $('#chatbox').empty();
            
            if (history && history.length > 0) {
                history.forEach(msg => {
                    const messageClass = msg.role === 'user' ? 'user-message' : 'assistant-message';
                    
                    // assistant 메시지의 경우 통계 업데이트
                    if (msg.role === 'assistant') {
                        const turn = extractTurnFromMessage(msg.content);
                        const location = extractLocationFromMessage(msg.content);
                        // 히스토리에서는 발견을 업데이트하지 않음 (현재 턴만 표시)
                        gameStats.updateStats(turn, location, null);
                        const updatedContent = updateMessageStats(msg.content, gameStats.generateStatsBox());
                        $('#chatbox').append(`<div class="message ${messageClass}">${updatedContent}</div>`);
                    } else {
                        $('#chatbox').append(`<div class="message ${messageClass}">${msg.content}</div>`);
                    }
                });
                
                $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            } else {
                $('#chatbox').append(`<div class="system-message">채팅 기록이 없습니다.</div>`);
            }
        } else {
            console.error('채팅 기록을 가져오는 중 오류:', data.error);
            $('#chatbox').append(`<div class="system-message error">채팅 기록을 가져오는 중 오류가 발생했습니다.</div>`);
        }
    }
    
    // 이미지 완료 처리
    function handleImageReady(event, data) {
        if (data.success && data.image_data) {
            console.log('Displaying generated image');
            displayGeneratedImage(data.image_data);
        } else {
            console.error('이미지 데이터가 없습니다:', data);
        }
    }
    
    // 이미지 에러 처리
    function handleImageError(event, data) {
        console.error('Image generation error:', data);
        
        // 에러 메시지는 UI.js에서 처리하므로 여기서는 로그만
        if (data.error_type === 'content_policy') {
            console.warn('Content policy violation detected');
        }
    }
    
    // 생성된 이미지 표시 - 오른쪽 이미지 영역에 표시
    function displayGeneratedImage(imageData) {
        try {
            // 이미지 영역 초기화 (기존 이미지 제거)
            const imageDisplay = $('#image-display');
            imageDisplay.empty();
            
            // 로딩 스피너 표시
            imageDisplay.html(`
                <div class="image-loading-container" style="text-align: center; padding: 40px;">
                    <div class="spinner"></div>
                    <div style="margin-top: 20px; color: #6c757d;">이미지 로딩 중...</div>
                </div>
            `);
            
            // 이미지 컨테이너 생성
            const imageContainer = $(`
                <div class="generated-image-container">
                    <img class="generated-image" alt="Generated dungeon scene" />
                    <div class="image-info">
                        <div class="image-scene-info">양피지 스타일 던전 일러스트</div>
                        <button class="btn btn-sm btn-secondary download-btn" style="margin-top: 10px;">이미지 다운로드</button>
                        <button class="btn btn-sm btn-outline-secondary toggle-prompt-btn" style="margin-top: 10px; margin-left: 5px;">프롬프트 보기</button>
                    </div>
                    <div class="image-prompt" style="display: none; margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
                        <div class="prompt-section">
                            <strong>생성 프롬프트:</strong>
                            <p style="margin-top: 5px; font-size: 0.85rem; color: #6c757d;">${imageData.prompt || 'N/A'}</p>
                        </div>
                        ${imageData.revised_prompt && imageData.revised_prompt !== imageData.prompt ? `
                        <div class="revised-prompt-section" style="margin-top: 10px;">
                            <strong>수정된 프롬프트:</strong>
                            <p style="margin-top: 5px; font-size: 0.85rem; color: #6c757d;">${imageData.revised_prompt}</p>
                        </div>
                        ` : ''}
                        ${imageData.sceneDescription ? `
                        <div class="scene-section" style="margin-top: 10px;">
                            <strong>장면 설명:</strong>
                            <p style="margin-top: 5px; font-size: 0.85rem; color: #6c757d;">${imageData.sceneDescription.substring(0, 200)}...</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `);
            
            // 이미지 로드
            const img = imageContainer.find('.generated-image');
            const imageUrl = `data:image/${imageData.format || 'png'};base64,${imageData.base64}`;
            
            img.on('load', function() {
                console.log('Image loaded successfully');
                // 로딩 스피너 제거하고 이미지 표시
                imageDisplay.empty();
                imageDisplay.append(imageContainer);
                
                // 다운로드 버튼 이벤트
                imageContainer.find('.download-btn').on('click', function() {
                    downloadImage(imageUrl, `dungeon_scene_${Date.now()}.png`);
                });
                
                // 프롬프트 토글 버튼 이벤트
                imageContainer.find('.toggle-prompt-btn').on('click', function() {
                    const promptDiv = imageContainer.find('.image-prompt');
                    promptDiv.slideToggle();
                    $(this).text(promptDiv.is(':visible') ? '프롬프트 숨기기' : '프롬프트 보기');
                });
            });
            
            img.on('error', function() {
                console.error('Failed to load image');
                imageDisplay.html(`
                    <div class="error-message" style="text-align: center; padding: 20px; color: #dc3545;">
                        <p>이미지를 불러올 수 없습니다.</p>
                        <small>이미지 데이터가 손상되었거나 형식이 올바르지 않습니다.</small>
                    </div>
                `);
            });
            
            img.attr('src', imageUrl);
            
            console.log('Image display completed');
            
        } catch (error) {
            console.error('Error displaying image:', error);
            $('#image-display').html(`
                <div class="error-message" style="text-align: center; padding: 20px; color: #dc3545;">
                    <p>이미지 표시 중 오류가 발생했습니다.</p>
                    <small>${error.message}</small>
                </div>
            `);
        }
    }
    
    // 이미지 다운로드 함수
    function downloadImage(dataUrl, filename) {
        try {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log('Image download initiated:', filename);
        } catch (error) {
            console.error('Download error:', error);
            alert('이미지 다운로드 중 오류가 발생했습니다.');
        }
    }
    
    // 이미지 영역 초기화 함수 (게임 시작/종료 시 사용)
    function clearImageDisplay() {
        $('#image-display').html(`
            <div class="no-image-placeholder">
                게임을 시작하면 이미지가 표시됩니다
            </div>
        `);
    }
    
    return {
        initialize: initialize,
        sendMessage: sendMessage,
        getChatHistory: getChatHistory,
        clearImageDisplay: clearImageDisplay,
        displayGeneratedImage: displayGeneratedImage,
        gameStats: gameStats  // 외부 접근용
    };
})();
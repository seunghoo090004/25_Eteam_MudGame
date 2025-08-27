// public/javascripts/chat.js - 조건부 이미지 표시 지원

const GameChat = (function() {
    function initialize() {
        setupEventHandlers();
    }
    
    function setupEventHandlers() {
        // 기존 채팅 관련 이벤트 핸들러
        $(document).on('chat:history', handleChatHistory);
        
        // 이미지 관련 이벤트 핸들러
        $(document).on('image:ready', handleImageReady);
        $(document).on('image:error', handleImageError);
        $(document).on('image:skipped', handleImageSkipped);  // 새로 추가
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
                    $('#chatbox').append(`<div class="message ${messageClass}">${msg.content}</div>`);
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
            console.log('Displaying generated image - Trigger:', data.image_data.trigger_reason);
            if (data.image_data.new_discoveries) {
                console.log('New discoveries:', data.image_data.new_discoveries);
            }
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
    
    // 이미지 생성 건너뜀 처리 (새로 추가)
    function handleImageSkipped(event, data) {
        console.log('Image generation skipped:', data.reason);
        
        // 이미지 영역에 안내 메시지 표시 (선택사항)
        const imageDisplay = $('#image-display');
        if (imageDisplay.length && data.reason === 'no_new_discovery') {
            // 기존 이미지가 있으면 유지, 없으면 안내 메시지
            if (imageDisplay.find('.generated-image').length === 0) {
                imageDisplay.html(`
                    <div class="no-image-placeholder" style="text-align: center; padding: 20px; color: #6c757d;">
                        <p>새로운 발견이 있을 때 이미지가 생성됩니다</p>
                        <small>몬스터 조우, 아이템 발견 시 자동 생성</small>
                    </div>
                `);
            }
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
                        ${imageData.trigger_reason ? `<div class="trigger-reason" style="font-size: 0.8rem; color: #6c757d; margin-top: 5px;">트리거: ${
                            imageData.trigger_reason === 'special_trigger' ? '특별 이벤트' :
                            imageData.trigger_reason === 'new_discovery' ? '새로운 발견' :
                            imageData.trigger_reason
                        }</div>` : ''}
                        ${imageData.new_discoveries ? `<div class="new-discoveries" style="font-size: 0.8rem; color: #28a745; margin-top: 5px;">발견: ${imageData.new_discoveries.join(', ')}</div>` : ''}
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
            
            // 다운로드 버튼 이벤트 (이미지 로드 후 바인딩)
            img.on('load', function() {
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
        displayGeneratedImage: displayGeneratedImage
    };
})();
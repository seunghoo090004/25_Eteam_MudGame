// public/javascripts/chat.js - 이미지 스킵 처리 추가

const GameChat = (function() {
    function initialize() {
        setupEventHandlers();
    }
    
    function setupEventHandlers() {
        // 기존 채팅 관련 이벤트 핸들러
        $(document).on('chat:response', handleChatResponse);
        $(document).on('chat:history', handleChatHistory);
        
        // 이미지 관련 이벤트 핸들러
        $(document).on('image:generating', handleImageGenerating);
        $(document).on('image:ready', handleImageReady);
        $(document).on('image:error', handleImageError);
        $(document).on('image:skipped', handleImageSkipped);
    }
    
    // 채팅 응답 처리
    function handleChatResponse(event, data) {
        if (data.success) {
            // 통계 박스까지만 표시 (선택지 제거)
            let displayContent = data.response;
            
            // 통계 박스 끝 찾기 (마지막 === 라인 이후 모든 내용 제거)
            const statsEndIndex = displayContent.lastIndexOf('===============================================');
            if (statsEndIndex !== -1) {
                // === 라인 이후 줄바꿈 찾기
                const newlineAfterStats = displayContent.indexOf('\n', statsEndIndex);
                if (newlineAfterStats !== -1) {
                    // 통계 박스까지만 잘라내기 (선택지 제거)
                    displayContent = displayContent.substring(0, newlineAfterStats);
                }
            }
            
            // 채팅 메시지 표시 (한 번만)
            appendMessage('assistant', displayContent);
            
            // 게임 상태 업데이트
            if (data.game_state) {
                GameState.updateGameStateFromParsing(data.game_state);
            }
        } else {
            console.error('Chat response error:', data.error);
            appendMessage('system', `오류: ${data.error}`);
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
        
        // 사용자 메시지 표시
        appendMessage('user', message);
        
        // 서버로 메시지 전송
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
    
    // 메시지 추가
    function appendMessage(role, content) {
        const messageClass = role === 'user' ? 'user-message' : 
                           role === 'assistant' ? 'assistant-message' : 
                           'system-message';
        
        $('#chatbox').append(`
            <div class="message ${messageClass}">
                ${content}
            </div>
        `);
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    // ✅ 이미지 생성 시작 처리
    function handleImageGenerating(event, data) {
        console.log('Image generation started:', data.message);
        
        // 이미지 영역에 로딩 표시
        $('#image-display').html(`
            <div class="image-loading-container">
                <div class="spinner"></div>
                <div class="loading-message">${data.message || '이미지 생성 중...'}</div>
            </div>
        `);
    }
    
    // ✅ 이미지 생성 스킵 처리
    function handleImageSkipped(event, data) {
        console.log('Image generation skipped:', data.reason);
        
        // 이미지가 스킵된 경우 로딩 스피너만 제거
        const $imageDisplay = $('#image-display');
        
        // 로딩 중이었다면 제거
        if ($imageDisplay.find('.image-loading-container').length > 0) {
            // 기존 이미지가 있는지 확인
            const existingImage = $imageDisplay.data('lastImage');
            
            if (existingImage) {
                // 이전 이미지가 있으면 그대로 유지
                console.log('Keeping previous image');
            } else {
                // 이전 이미지가 없으면 플레이스홀더 표시
                $imageDisplay.html(`
                    <div class="no-image-placeholder">
                        새로운 발견이 있을 때 이미지가 표시됩니다
                    </div>
                `);
            }
        }
        // 이미 이미지가 표시되어 있다면 그대로 유지
    }
    
    // ✅ 이미지 준비 완료 처리
    function handleImageReady(event, data) {
        if (data.success && data.image_data) {
            console.log('Displaying new discovery image');
            displayGeneratedImage(data.image_data);
        } else {
            console.error('이미지 데이터가 없습니다:', data);
        }
    }
    
    // ✅ 이미지 에러 처리
    function handleImageError(event, data) {
        console.error('Image generation error:', data);
        
        $('#image-display').html(`
            <div class="error-message">
                <p>이미지 생성 중 오류가 발생했습니다</p>
                <small>${data.error || '알 수 없는 오류'}</small>
            </div>
        `);
    }
    
    // ✅ 생성된 이미지 표시
    function displayGeneratedImage(imageData) {
        try {
            const imageDisplay = $('#image-display');
            
            // 이미지 컨테이너 생성
            const imageContainer = $(`
                <div class="generated-image-container">
                    <img class="generated-image" alt="Generated dungeon scene" />
                    <div class="image-info">
                        <div class="image-scene-info">양피지 스타일 던전 일러스트</div>
                        <button class="btn btn-sm btn-secondary download-btn">이미지 다운로드</button>
                        <button class="btn btn-sm btn-outline-secondary toggle-prompt-btn">프롬프트 보기</button>
                    </div>
                    <div class="image-prompt" style="display: none;">
                        <div class="prompt-section">
                            <strong>생성 프롬프트:</strong>
                            <p>${imageData.prompt || 'N/A'}</p>
                        </div>
                        ${imageData.revised_prompt && imageData.revised_prompt !== imageData.prompt ? 
                          `<div class="prompt-section">
                            <strong>수정된 프롬프트:</strong>
                            <p>${imageData.revised_prompt}</p>
                          </div>` : ''}
                    </div>
                </div>
            `);
            
            // 이미지 로드
            const img = imageContainer.find('.generated-image');
            const dataUrl = `data:image/${imageData.format || 'png'};base64,${imageData.base64}`;
            
            img.on('load', function() {
                console.log('Image loaded successfully');
                imageDisplay.html(imageContainer);
                
                // 마지막 이미지 데이터 저장
                imageDisplay.data('lastImage', imageData);
                
                // 다운로드 버튼 이벤트
                imageContainer.find('.download-btn').on('click', function() {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    downloadImage(dataUrl, `dungeon-${timestamp}.png`);
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
                    <div class="error-message">
                        <p>이미지를 로드할 수 없습니다</p>
                    </div>
                `);
            });
            
            img.attr('src', dataUrl);
            
        } catch (error) {
            console.error('Error displaying image:', error);
            $('#image-display').html(`
                <div class="error-message">
                    <p>이미지 표시 중 오류가 발생했습니다.</p>
                    <small>${error.message}</small>
                </div>
            `);
        }
    }
    
    // 이미지 다운로드
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
    
    // 이미지 영역 초기화
    function clearImageDisplay() {
        $('#image-display').html(`
            <div class="no-image-placeholder">
                게임을 시작하면 이미지가 표시됩니다
            </div>
        `);
        $('#image-display').removeData('lastImage');
    }
    
    return {
        initialize: initialize,
        sendMessage: sendMessage,
        getChatHistory: getChatHistory,
        appendMessage: appendMessage,
        clearImageDisplay: clearImageDisplay,
        displayGeneratedImage: displayGeneratedImage
    };
})();
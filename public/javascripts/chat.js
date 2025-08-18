// public/javascripts/chat.js - 이미지 표시 기능 추가

const GameChat = (function() {
    function initialize() {
        setupEventHandlers();
    }
    
    function setupEventHandlers() {
        // 기존 채팅 관련 이벤트 핸들러
        $(document).on('chat:history', handleChatHistory);
        
        // ✅ 새로운 이미지 관련 이벤트 핸들러
        $(document).on('image:ready', handleImageReady);
        $(document).on('image:error', handleImageError);
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
    
    // ✅ 이미지 완료 처리
    function handleImageReady(event, data) {
        if (data.success && data.image_data) {
            console.log('Displaying generated image');
            displayGeneratedImage(data.image_data);
        } else {
            console.error('이미지 데이터가 없습니다:', data);
        }
    }
    
    // ✅ 이미지 에러 처리
    function handleImageError(event, data) {
        console.error('Image generation error:', data);
        
        // 에러 메시지는 UI.js에서 처리하므로 여기서는 로그만
        if (data.error_type === 'content_policy') {
            console.warn('Content policy violation detected');
        }
    }
    
    // ✅ 생성된 이미지 표시 (오른쪽 이미지 영역에)
    function displayGeneratedImage(imageData) {
        try {
            // 기존 이미지 제거 및 새 이미지 컨테이너 준비
            const imageContainer = $('#game-image-container');
            const placeholder = $('.image-placeholder');
            
            // 기존 이미지 완전 제거
            imageContainer.empty();
            
            // placeholder 숨기기, 이미지 컨테이너 표시
            placeholder.hide();
            imageContainer.show();
            
            // 이미지 컨테이너 생성
            const imageElement = $(`
                <div class="generated-image-container">
                    <div class="image-header">
                        <span class="image-title">생성된 이미지</span>
                        <span class="image-info">양피지 스타일 던전 일러스트</span>
                    </div>
                    <div class="image-wrapper">
                        <img class="generated-image" alt="Generated dungeon scene" />
                        <div class="image-loading">
                            <div class="spinner"></div>
                            <span>이미지 로딩 중...</span>
                        </div>
                    </div>
                    <div class="image-footer">
                        <button class="btn btn-sm btn-secondary download-btn">다운로드</button>
                        <button class="btn btn-sm btn-outline-secondary toggle-prompt-btn">프롬프트 보기</button>
                    </div>
                    <div class="image-prompt" style="display: none;">
                        <div class="prompt-section">
                            <strong>생성 프롬프트:</strong>
                            <p>${imageData.prompt}</p>
                        </div>
                        ${imageData.revised_prompt && imageData.revised_prompt !== imageData.prompt ? `
                            <div class="prompt-section">
                                <strong>수정된 프롬프트:</strong>
                                <p>${imageData.revised_prompt}</p>
                            </div>
                        ` : ''}
                        <div class="prompt-section">
                            <strong>추출된 상황 묘사:</strong>
                            <p>${imageData.sceneDescription || '상황 묘사 없음'}</p>
                        </div>
                    </div>
                </div>
            `);
            
            // 이미지 소스 설정
            const img = imageElement.find('.generated-image');
            const loadingDiv = imageElement.find('.image-loading');
            
            img.on('load', function() {
                loadingDiv.hide();
                img.show();
            });
            
            img.on('error', function() {
                loadingDiv.html('<span class="error">이미지 로딩 실패</span>');
            });
            
            // Base64 이미지 데이터 설정
            const imageUrl = `data:image/${imageData.format || 'png'};base64,${imageData.base64}`;
            img.attr('src', imageUrl);
            
            // 다운로드 버튼 이벤트
            imageElement.find('.download-btn').click(function() {
                downloadImage(imageUrl, `dungeon-image-${Date.now()}.${imageData.format || 'png'}`);
            });
            
            // 프롬프트 토글 버튼 이벤트
            imageElement.find('.toggle-prompt-btn').click(function() {
                const promptDiv = imageElement.find('.image-prompt');
                const btn = $(this);
                
                if (promptDiv.is(':visible')) {
                    promptDiv.slideUp();
                    btn.text('프롬프트 보기');
                } else {
                    promptDiv.slideDown();
                    btn.text('프롬프트 숨기기');
                }
            });
            
            // 이미지 컨테이너에 추가
            imageContainer.append(imageElement);
            
        } catch (e) {
            console.error('이미지 표시 중 오류:', e);
            
            // 오류 시 placeholder 다시 표시
            $('.image-placeholder').show();
            $('#game-image-container').hide();
        }
    }
    
    // ✅ 이미지 다운로드 함수
    function downloadImage(dataUrl, filename) {
        try {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = filename;
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log('이미지 다운로드 시작:', filename);
        } catch (e) {
            console.error('이미지 다운로드 오류:', e);
            alert('이미지 다운로드 중 오류가 발생했습니다.');
        }
    }
    
    return {
        initialize: initialize,
        sendMessage: sendMessage,
        getChatHistory: getChatHistory
    };
})();
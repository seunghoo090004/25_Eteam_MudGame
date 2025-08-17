// public/js/game/chat.js
const GameChat = (function() {
    function initialize() {
        // 채팅 관련 이벤트 설정
        setupEventHandlers();
    }
    
    function setupEventHandlers() {
        // 채팅 관련 이벤트 핸들러 등록
        $(document).on('chat:history', handleChatHistory);
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
        
        // 메시지 전송
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
        
        // 채팅 기록 요청
        GameSocket.emit('get chat history', {
            game_id: currentGameId
        });
        
        return true;
    }
    
    // 채팅 기록 응답 처리
    function handleChatHistory(event, data) {
        if (data.success) {
            // 채팅 기록 표시
            const history = data.history;
            
            // 채팅창 초기화
            $('#chatbox').empty();
            
            if (history && history.length > 0) {
                // 채팅 메시지 표시
                history.forEach(msg => {
                    const messageClass = msg.role === 'user' ? 'user-message' : 'assistant-message';
                    $('#chatbox').append(`<div class="message ${messageClass}">${msg.content}</div>`);
                });
                
                // 스크롤 조정
                $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            } else {
                $('#chatbox').append(`<div class="system-message">채팅 기록이 없습니다.</div>`);
            }
        } else {
            console.error('채팅 기록을 가져오는 중 오류:', data.error);
            $('#chatbox').append(`<div class="system-message error">채팅 기록을 가져오는 중 오류가 발생했습니다.</div>`);
        }
    }
    
    // 공개 API
    return {
        initialize: initialize,
        sendMessage: sendMessage,
        getChatHistory: getChatHistory
    };
})();
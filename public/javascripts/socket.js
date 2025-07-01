// public/javascripts/socket.js - API 분리 후 Socket 전용
const GameSocket = (function() {
    let socket = null;
    let isConnected = false;
    
    function initialize() {
        socket = io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        // 연결 이벤트 핸들러
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        
        // 게임 이벤트 핸들러 (채팅 전용)
        setupSocketEventHandlers();
    }
    
    function handleConnect() {
        console.log('Socket connected successfully');
        isConnected = true;
        
        // 연결 오류 메시지 제거
        $('#connection-error').remove();
        
        // 연결 성공 이벤트 발생
        $(document).trigger('socket:connected');
    }
    
    function handleDisconnect() {
        console.log('Socket disconnected');
        isConnected = false;
        
        // 연결 끊김 메시지 표시
        if ($('#connection-error').length === 0) {
            $('#chatbox').append(`
                <div id="connection-error" class="system-message error">
                    서버 연결이 끊어졌습니다. 재연결 중...
                    <button id="manual-reconnect" class="btn btn-primary mt-2">수동 재연결</button>
                </div>
            `);
            
            $('#manual-reconnect').click(function() {
                $('#connection-error').text('재연결 시도 중...');
                socket.connect();
            });
        }
    }
    
    function handleConnectError(error) {
        console.error('Socket connection error:', error);
        
        // 연결 오류 메시지 표시
        if ($('#connection-error').length === 0) {
            $('#chatbox').append(`
                <div id="connection-error" class="system-message error">
                    서버 연결 오류: ${error.message || '알 수 없는 오류'}
                    <button id="manual-reconnect" class="btn btn-primary mt-2">수동 재연결</button>
                </div>
            `);
            
            $('#manual-reconnect').click(function() {
                $('#connection-error').text('재연결 시도 중...');
                socket.connect();
            });
        }
    }
    
    function setupSocketEventHandlers() {
        // 채팅 응답 핸들러 (Socket 전용 유지)
        socket.on('chat response', function(data) {
            $(document).trigger('chat:response', [data]);
        });
        
        // 🔄 수정: 새 게임은 Socket에서 초기 메시지만 처리
        socket.on('new game response', function(data) {
            $(document).trigger('game:new', [data]);
        });
        
        // 🔄 수정: 게임 로드는 Socket에서 채팅 히스토리만 처리
        socket.on('load game response', function(data) {
            $(document).trigger('game:load', [data]);
        });
        
        // ❌ 제거: 게임 목록, 저장, 삭제는 API로 이전
        // socket.on('games list response', ...)
        // socket.on('save game response', ...)
        // socket.on('delete game response', ...)
        
        // 채팅 기록 응답 핸들러 (유지)
        socket.on('chat history response', function(data) {
            $(document).trigger('chat:history', [data]);
        });
    }
    
    function emit(event, data) {
        if (!isConnected) {
            console.error('Cannot emit event. Socket not connected');
            return false;
        }
        
        socket.emit(event, data);
        return true;
    }
    
    // ❌ 제거: 게임 목록은 API로 처리
    // function loadGamesList(forceRefresh = false) { ... }
    
    function isSocketConnected() {
        return isConnected;
    }
    
    // 공개 API (Socket 전용 기능만)
    return {
        initialize: initialize,
        emit: emit,
        isConnected: isSocketConnected
        // loadGamesList 제거 - API로 이전
    };
})();
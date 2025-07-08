// public/javascripts/socket.js - 이벤트 중복 방지 버전
const GameSocket = (function() {
    let socket = null;
    let isConnected = false;
    let eventsRegistered = false; // ✅ 추가: 이벤트 등록 상태 추적
    
    function initialize() {
        socket = io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        
        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        
        setupSocketEventHandlers();
    }
    
    function handleConnect() {
        console.log('Socket connected successfully');
        isConnected = true;
        
        $('#connection-error').remove();
        $(document).trigger('socket:connected');
    }
    
    function handleDisconnect() {
        console.log('Socket disconnected');
        isConnected = false;
        
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
        // ✅ 수정: 이벤트 중복 등록 방지
        if (eventsRegistered) {
            console.log('Socket events already registered, skipping...');
            return;
        }
        
        // 채팅 응답 핸들러
        socket.on('chat response', function(data) {
            console.log('Socket received chat response:', data);
            $(document).trigger('chat:response', [data]);
        });
        
        // 새 게임 응답 핸들러
        socket.on('new game response', function(data) {
            console.log('Socket received new game response:', data);
            $(document).trigger('game:new', [data]);
        });
        
        // 게임 로드 응답 핸들러
        socket.on('load game response', function(data) {
            console.log('Socket received load game response:', data);
            $(document).trigger('game:load', [data]);
        });
        
        // 채팅 기록 응답 핸들러
        socket.on('chat history response', function(data) {
            console.log('Socket received chat history response:', data);
            $(document).trigger('chat:history', [data]);
        });
        
        eventsRegistered = true; // ✅ 추가: 이벤트 등록 완료 표시
        console.log('Socket event handlers registered');
    }
    
    function emit(event, data) {
        if (!isConnected) {
            console.error('Cannot emit event. Socket not connected');
            return false;
        }
        
        console.log(`Socket emitting: ${event}`, data);
        socket.emit(event, data);
        return true;
    }
    
    function isSocketConnected() {
        return isConnected;
    }
    
    return {
        initialize: initialize,
        emit: emit,
        isConnected: isSocketConnected
    };
})();
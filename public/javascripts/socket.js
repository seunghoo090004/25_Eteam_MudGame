// public/js/game/socket.js
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
        
        // 게임 이벤트 핸들러
        setupGameEventHandlers();
    }
    
    function handleConnect() {
        console.log('Socket connected successfully');
        isConnected = true;
        
        // 연결 오류 메시지 제거
        $('#connection-error').remove();
        
        // 연결 성공 이벤트 발생
        $(document).trigger('socket:connected');
        
        // 연결 후 게임 목록 로드
        loadGamesList();
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
    
    function setupGameEventHandlers() {
        // 채팅 응답 핸들러
        socket.on('chat response', function(data) {
            $(document).trigger('chat:response', [data]);
        });
        
        // 게임 목록 응답 핸들러
        socket.on('games list response', function(data) {
            $(document).trigger('games:list', [data]);
        });
        
        // 새 게임 응답 핸들러
        socket.on('new game response', function(data) {
            $(document).trigger('game:new', [data]);
        });
        
        // 게임 로드 응답 핸들러
        socket.on('load game response', function(data) {
            $(document).trigger('game:load', [data]);
        });
        
        // 게임 저장 진행 핸들러
        socket.on('save game progress', function(data) {
            $(document).trigger('game:saveProgress', [data]);
        });
        
        // 게임 저장 응답 핸들러
        socket.on('save game response', function(data) {
            $(document).trigger('game:save', [data]);
        });
        
        // 게임 삭제 응답 핸들러
        socket.on('delete game response', function(data) {
            $(document).trigger('game:delete', [data]);
        });
        
        // 채팅 기록 응답 핸들러
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
    
    function loadGamesList(forceRefresh = false) {
        if (isConnected) {
            console.log('게임 목록 로드 요청' + (forceRefresh ? ' (강제 갱신)' : ''));
            
            if (forceRefresh) {
                const savedGamesList = $('#saved_games_list');
                savedGamesList.empty();
                savedGamesList.append('<p>게임 목록 업데이트 중...</p>');
            }
            
            emit('get games list', { forceRefresh: forceRefresh });
        } else {
            console.error('Socket not connected. Cannot load games list.');
        }
    }
    
    function isSocketConnected() {
        return isConnected;
    }
    
    // 공개 API
    return {
        initialize: initialize,
        emit: emit,
        isConnected: isSocketConnected,
        loadGamesList: loadGamesList
    };
})();
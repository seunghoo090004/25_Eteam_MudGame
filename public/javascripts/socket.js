// public/javascripts/socket.js - 이미지 스킵 이벤트 추가

const GameSocket = (function() {
    let socket = null;
    let isConnected = false;
    let eventsRegistered = false;
    
    function initialize() {
        if (socket && isConnected) {
            console.log('Socket already initialized');
            return;
        }
        
        socket = io();
        
        socket.on('connect', function() {
            console.log('Socket connected');
            isConnected = true;
            $(document).trigger('socket:connected');
        });
        
        socket.on('disconnect', function() {
            console.log('Socket disconnected');
            isConnected = false;
            $(document).trigger('socket:disconnected');
        });
        
        registerEventHandlers();
    }
    
    function registerEventHandlers() {
        if (!socket || eventsRegistered) {
            console.log('Socket events already registered, skipping...');
            return;
        }
        
        // 기존 채팅 응답 핸들러
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
        
        // ✅ 이미지 관련 이벤트 핸들러들
        
        // 이미지 생성 시작 신호
        socket.on('image generating', function(data) {
            console.log('Socket received image generating:', data);
            $(document).trigger('image:generating', [data]);
        });
        
        // 이미지 완료 신호 + 데이터
        socket.on('image ready', function(data) {
            console.log('Socket received image ready:', data);
            $(document).trigger('image:ready', [data]);
        });
        
        // 이미지 생성 실패 신호
        socket.on('image error', function(data) {
            console.log('Socket received image error:', data);
            $(document).trigger('image:error', [data]);
        });
        
        // ✅ 이미지 생성 스킵 신호 (새로운 발견이 없을 때)
        socket.on('image skipped', function(data) {
            console.log('Socket received image skipped:', data);
            $(document).trigger('image:skipped', [data]);
        });
        
        eventsRegistered = true;
        console.log('Socket event handlers registered (including image events)');
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
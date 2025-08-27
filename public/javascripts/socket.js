// public/javascripts/socket.js - 이미지 스킵 이벤트 추가

const GameSocket = (function() {
    let socket = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    
    function initialize() {
        if (socket && socket.connected) {
            console.log('Socket already connected');
            return;
        }
        
        socket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: MAX_RECONNECT_ATTEMPTS
        });
        
        setupEventHandlers();
        console.log('Socket.IO initialized');
    }
    
    function setupEventHandlers() {
        // 연결 이벤트
        socket.on('connect', () => {
            console.log('Socket connected');
            reconnectAttempts = 0;
            $(document).trigger('socket:connected');
        });
        
        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            $(document).trigger('socket:disconnected');
        });
        
        socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            reconnectAttempts++;
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                $(document).trigger('socket:error', { error: 'Maximum reconnection attempts reached' });
            }
        });
        
        // 게임 관련 이벤트
        socket.on('game created', (data) => {
            console.log('Game created:', data);
            $(document).trigger('game:new', data);
        });
        
        socket.on('game loaded', (data) => {
            console.log('Game loaded:', data);
            $(document).trigger('game:loaded', data);
        });
        
        socket.on('game list', (data) => {
            console.log('Game list received');
            $(document).trigger('game:list', data);
        });
        
        socket.on('game ending', (data) => {
            console.log('Game ending received:', data);
            $(document).trigger('game:ending', data);
        });
        
        socket.on('ending saved', (data) => {
            console.log('Ending saved:', data);
            $(document).trigger('ending:saved', data);
        });
        
        // 채팅 관련 이벤트
        socket.on('chat response', (data) => {
            console.log('Chat response received');
            $(document).trigger('chat:response', data);
        });
        
        socket.on('chat history', (data) => {
            console.log('Chat history received');
            $(document).trigger('chat:history', data);
        });
        
        // 이미지 관련 이벤트
        socket.on('image generating', (data) => {
            console.log('Image generating:', data);
            $(document).trigger('image:generating', data);
        });
        
        socket.on('image ready', (data) => {
            console.log('Image ready:', data);
            $(document).trigger('image:ready', data);
        });
        
        socket.on('image error', (data) => {
            console.error('Image error:', data);
            $(document).trigger('image:error', data);
        });
        
        // 새로 추가: 이미지 스킵 이벤트
        socket.on('image skipped', (data) => {
            console.log('Image generation skipped:', data);
            $(document).trigger('image:skipped', data);
        });
        
        // 오류 관련 이벤트
        socket.on('error', (data) => {
            console.error('Socket error:', data);
            $(document).trigger('socket:error', data);
        });
    }
    
    function emit(event, data) {
        if (socket && socket.connected) {
            socket.emit(event, data);
            return true;
        } else {
            console.error('Socket not connected');
            return false;
        }
    }
    
    function isConnected() {
        return socket && socket.connected;
    }
    
    function disconnect() {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
    }
    
    function reconnect() {
        if (socket) {
            socket.connect();
        } else {
            initialize();
        }
    }
    
    return {
        initialize: initialize,
        emit: emit,
        isConnected: isConnected,
        disconnect: disconnect,
        reconnect: reconnect
    };
})();
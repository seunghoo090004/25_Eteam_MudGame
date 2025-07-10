// public/javascripts/main.js - 수정된 버전

$(document).ready(function() {
    GameState.initialize();
    GameUI.initialize();
    GameSocket.initialize();
    GameChat.initialize();
    
    initializeApp();
});

async function initializeApp() {
    try {
        const status = await GameAPI.status();
        console.log('API 상태:', status);
    } catch (error) {
        console.error('앱 초기화 오류:', error);
        $('#chatbox').html('<div class="system-message error">서버 연결 오류가 발생했습니다.</div>');
    }
}
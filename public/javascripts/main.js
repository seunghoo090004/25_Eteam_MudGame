// public/js/game/main.js
$(document).ready(function() {
    // 게임 모듈 초기화
    GameState.initialize();
    GameUI.initialize();
    GameSocket.initialize();
    GameChat.initialize();
    
    // 게임 불러오기 전역 함수 설정
    window.loadGame = function(gameId) {
        // 선택지 처리 중인 경우 로드 불가
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        // 기존 게임 진행 중인지 확인
        if (GameState.getCurrentGameId() && !confirm('다른 게임을 불러오면 현재 진행 중인 게임은 저장되지 않습니다. 계속하시겠습니까?')) {
            return;
        }
        
        // 로딩 오버레이 표시
        GameUI.showLoading('게임을 불러오는 중...');
        
        // 로딩 메시지 표시
        $('#chatbox').empty().append(`<div class="message system-message">게임을 불러오는 중...</div>`);
        
        // 게임 로드 요청
        GameSocket.emit('load game', {
            game_id: gameId
        });
    };
    
    // 게임 삭제 전역 함수 설정
    window.deleteGame = function(gameId) {
        // 선택지 처리 중인 경우 삭제 불가
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        if (!confirm('정말 이 게임을 삭제하시겠습니까?')) return;
        
        // 게임 삭제 요청
        GameSocket.emit('delete game', {
            game_id: gameId
        });
    };
});
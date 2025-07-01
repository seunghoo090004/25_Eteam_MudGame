// public/javascripts/main.js - API 연동 완전 버전 (수정됨)
$(document).ready(function() {
    // 게임 모듈 초기화
    GameState.initialize();
    GameUI.initialize();
    GameSocket.initialize();
    GameChat.initialize();
    
    // API 상태 확인 및 게임 목록 로드
    initializeApp();
});

// 앱 초기화
async function initializeApp() {
    try {
        // API 상태 확인
        const status = await GameAPI.status();
        console.log('API 상태:', status);
        
        // 게임 목록 로드
        await GameUI.loadGamesList();
        
    } catch (error) {
        console.error('앱 초기화 오류:', error);
        $('#saved_games_list').html('<p>서버 연결 오류가 발생했습니다.</p>');
    }
}

// 게임 불러오기 전역 함수 (API 사용)
window.loadGame = async function(gameId) {
    if (GameState.isProcessingChoice()) {
        alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
        return;
    }
    
    if (GameState.getCurrentGameId() && !confirm('다른 게임을 불러오면 현재 진행 중인 게임은 저장되지 않습니다. 계속하시겠습니까?')) {
        return;
    }
    
    GameUI.showLoading('게임을 불러오는 중...');
    $('#chatbox').empty().append(`<div class="message system-message">게임을 불러오는 중...</div>`);
    
    try {
        const response = await GameAPI.game.load(gameId);
        
        if (response.code === "result" && response.value === 1) {
            handleLoadGameSuccess(response.value_ext2.game);
        } else {
            throw new Error(response.value_ext2 || '게임을 불러올 수 없습니다.');
        }
    } catch (error) {
        console.error('게임 로드 오류:', error);
        GameUI.hideLoading();
        $('#chatbox').empty().append(`<div class="message error">게임 로드 중 오류: ${error.message || error}</div>`);
    }
};

// 게임 로드 성공 처리
function handleLoadGameSuccess(gameData) {
    GameUI.hideLoading();
    GameUI.enableAllButtons();
    
    // 게임 상태 설정
    GameState.setGameState(gameData.game_id, gameData.game_data);
    
    // 채팅창 초기화
    $('#chatbox').empty();
    
    if (gameData.chatHistory && gameData.chatHistory.length > 0) {
        // 마지막 AI 응답만 표시
        const chatHistory = [...gameData.chatHistory].sort((a, b) => {
            return new Date(a.created_at) - new Date(b.created_at);
        });
        
        const lastAIMessage = chatHistory.reverse().find(msg => msg.role === 'assistant');
        
        if (lastAIMessage) {
            $('#chatbox').append(`<div class="message assistant-message">${lastAIMessage.content}</div>`);
            
            const buttons = GameUI.createChoiceButtons(lastAIMessage.content);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
        } else {
            $('#chatbox').append(`<div class="system-message">게임을 이어서 진행합니다...</div>`);
        }
    } else {
        $('#chatbox').append(`<div class="system-message">게임을 이어서 진행합니다...</div>`);
    }
    
    $('#assistant-select').prop('disabled', true);
    $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
}

// 게임 삭제 전역 함수 (API 사용)
window.deleteGame = async function(gameId) {
    if (GameState.isProcessingChoice()) {
        alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
        return;
    }
    
    if (!confirm('정말 이 게임을 삭제하시겠습니까?')) return;
    
    try {
        const response = await GameAPI.game.delete(gameId);
        
        if (response.code === "result" && response.value === 1) {
            if (GameState.getCurrentGameId() === gameId) {
                GameState.clearGameState();
                $('#chatbox').empty();
                $('#assistant-select').prop('disabled', false);
            }
            
            alert('게임이 삭제되었습니다.');
            await GameUI.loadGamesList();
        } else {
            throw new Error(response.value_ext2 || '게임을 삭제할 수 없습니다.');
        }
    } catch (error) {
        console.error('게임 삭제 오류:', error);
        alert('게임 삭제 중 오류: ' + (error.message || error));
    }
};
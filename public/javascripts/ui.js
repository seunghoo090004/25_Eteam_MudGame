// public/javascripts/ui.js - 업데이트된 버전

const GameUI = (function() {
    let gameExists = false;
    
    function initialize() {
        bindUIEvents();
        setupEventHandlers();
        checkGameState();
    }
    
    // 선택지 버튼 생성 (수정된 파싱 로직)
    function createChoiceButtons(response) {
        if (!response || typeof response !== 'string') {
            return null;
        }
        
        // 사망이나 엔딩 상황에서는 버튼 생성하지 않음
        if (response.includes('당신은 죽었습니다') || response.includes('게임 종료')) {
            return null;
        }
        
        // 통계 섹션이 있는지 확인 (새 게임 상황 판단)
        const hasStats = response.match(/통계\s*={3,}/);
        if (!hasStats) {
            return null;
        }
        
        // 선택지 생성 (항상 4개)
        const choices = [
            { number: 1, text: '1번 선택지' },
            { number: 2, text: '2번 선택지' },
            { number: 3, text: '3번 선택지' },
            { number: 4, text: '4번 선택지' }
        ];
        
        let buttonsHtml = '<div class="choice-buttons">';
        choices.forEach(choice => {
            buttonsHtml += `
                <button class="choice-button btn btn-primary" data-choice="${choice.number}">
                    ${choice.text}
                </button>
            `;
        });
        buttonsHtml += '</div>';
        
        return buttonsHtml;
    }
    
    // 게임 상태 확인
    async function checkGameState() {
        try {
            const response = await GameAPI.game.loadCurrent();
            
            if (response.code === "result" && response.value === 1) {
                gameExists = true;
                updateLoadButtonState(true);
            } else {
                gameExists = false;
                updateLoadButtonState(false);
            }
        } catch (error) {
            gameExists = false;
            updateLoadButtonState(false);
            
            if (error.response?.status !== 404) {
                console.error('게임 상태 확인 오류:', error);
            }
        }
    }
    
    // 로딩 표시/숨김
    function showLoading() {
        $('#loading-overlay').show();
    }
    
    function hideLoading() {
        $('#loading-overlay').hide();
    }
    
    // 버튼 로딩 상태
    function setButtonLoading(button, isLoading) {
        if (isLoading) {
            button.prop('disabled', true);
            button.data('original-text', button.text());
            button.text('처리중...');
        } else {
            button.prop('disabled', false);
            button.text(button.data('original-text') || button.text());
        }
    }
    
    // 버튼 상태 관리
    function updateLoadButtonState(hasGame) {
        const loadButton = $('#load-game');
        
        if (hasGame) {
            loadButton.prop('disabled', false);
            loadButton.text('불러오기');
            loadButton.removeClass('btn-disabled').addClass('btn-primary');
        } else {
            loadButton.prop('disabled', true);
            loadButton.text('불러오기');
            loadButton.removeClass('btn-primary').addClass('btn-disabled');
        }
    }
    
    function disableAllButtons() {
        $('#new-game, #load-game, #view-endings').prop('disabled', true);
        $('.choice-button').prop('disabled', true);
    }

    function enableAllButtons() {
        $('#new-game, #view-endings').prop('disabled', false);
        $('.choice-button').prop('disabled', false);
        updateLoadButtonState(gameExists);
    }
    
    // 이벤트 바인딩
    function bindUIEvents() {
        $('#new-game').click(handleNewGame);
        $('#load-game').click(handleLoadGame);
        $('#view-endings').click(handleViewEndings);
        $('#logout-button').on('click', handleLogout);
    }
    
    function setupEventHandlers() {
        $(document).on('game:new', handleSocketNewGame);
        $(document).on('game:load', handleSocketGameLoad);
        $(document).on('socket:connected', function() {
            console.log('UI: Socket connected');
        });
    }
    
    // 새 게임 시작
// UI.js의 handleNewGame 함수 수정

    async function handleNewGame() {
        const assistantId = $('#assistant-select').val();
        if (!assistantId) {
            alert('어시스턴트를 선택해주세요.');
            return;
        }
        
        console.log('Selected Assistant ID:', assistantId); // 디버깅용
        
        showLoading();
        setButtonLoading($('#new-game'), true);
        disableAllButtons();
        
        try {
            const response = await GameAPI.game.create(assistantId, 'roguelike');
            console.log('API Create Response:', response); // 디버깅용
            
            // API 응답 구조 확인 후 적절한 필드 사용
            let gameData;
            if (response.code === "result" && response.value === 1) {
                // value_ext2에 데이터가 있는 경우
                gameData = response.value_ext2;
            } else if (response.data) {
                // data 필드에 있는 경우
                gameData = response.data;
            } else {
                // 직접 response에 있는 경우
                gameData = response;
            }
            
            console.log('Extracted Game Data:', gameData); // 디버깅용
            
            // 실제 응답 구조에 맞는 필드명 사용
            const socketData = {
                game_id: gameData.game_id || gameData.id,
                thread_id: gameData.thread_id,
                assistant_id: gameData.assistant_id || assistantId, // 원본 assistantId 사용
                game_data: gameData.game_data || gameData
            };
            
            console.log('Socket Data:', socketData); // 디버깅용
            
            // 필수 필드 확인
            if (!socketData.game_id || !socketData.thread_id || !socketData.assistant_id) {
                console.error('Missing fields:', {
                    game_id: !!socketData.game_id,
                    thread_id: !!socketData.thread_id, 
                    assistant_id: !!socketData.assistant_id
                });
                throw new Error('게임 생성 응답에 필수 정보가 누락되었습니다.');
            }
            
            GameSocket.emit('new game', socketData);
            
            gameExists = true;
            updateLoadButtonState(true);
            
        } catch (error) {
            console.error('새 게임 생성 오류:', error);
            hideLoading();
            setButtonLoading($('#new-game'), false);
            enableAllButtons();
            alert('게임 생성 중 오류: ' + (error.message || error));
        }
    }
    
    // 게임 불러오기
    async function handleLoadGame() {
        if (!gameExists) {
            alert('불러올 수 있는 게임이 없습니다.');
            return;
        }
        
        showLoading();
        setButtonLoading($('#load-game'), true);
        disableAllButtons();
        
        try {
            const response = await GameAPI.game.loadCurrent();
            
            if (response.code === "result" && response.value === 1) {
                const gameData = response.value_ext2;
                
                GameSocket.emit('load game', {
                    game_id: gameData.game_id
                });
            } else {
                throw new Error('게임 로드 실패');
            }
        } catch (error) {
            console.error('게임 로드 오류:', error);
            hideLoading();
            setButtonLoading($('#load-game'), false);
            
            if (error.response?.status === 404) {
                gameExists = false;
                updateLoadButtonState(false);
                alert('불러올 수 있는 게임이 없습니다.');
            } else {
                alert('게임 로드 중 오류: ' + (error.message || error));
            }
            
            enableAllButtons();
        }
    }
    
    function handleViewEndings() {
        window.open('/endings', '_blank');
    }
    
    function handleLogout(e) {
        e.preventDefault();
        if (confirm('정말 로그아웃 하시겠습니까?')) {
            window.location.href = '/auth/logout';
        }
    }
    
    // 소켓 이벤트 핸들러
    function handleSocketNewGame(event, data) {
        setButtonLoading($('#new-game'), false);
        
        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            GameState.setGameState(data.game_id, data.game_data);
            
            $('.system-message').remove();
            
            if (data.initial_message) {
                // 응답에서 선택지 텍스트 제거
                const cleanedMessage = cleanResponseForDisplay(data.initial_message);
                $('#chatbox').append(`<div class="message assistant-message">${cleanedMessage}</div>`);
                
                // 선택지 버튼 생성
                const buttons = createChoiceButtons(data.initial_message);
                if (buttons) {
                    $('#chatbox').append(buttons);
                }
            }
            
            $('#assistant-select').prop('disabled', true);
            enableAllButtons();
            
        } else {
            hideLoading();
            enableAllButtons();
            alert(data.error || '게임 시작 중 오류가 발생했습니다.');
        }
    }
    
    function handleSocketGameLoad(event, data) {
        hideLoading();
        setButtonLoading($('#load-game'), false);
        enableAllButtons();
        
        if (data.success) {
            GameState.setGameState(data.game.game_id, data.game.game_data);
            
            $('#chatbox').empty();
            
            if (data.game.chatHistory && data.game.chatHistory.length > 0) {
                const filteredHistory = data.game.chatHistory.filter(msg => msg.role === 'assistant');
                
                if (filteredHistory.length > 0) {
                    const lastAIMessage = filteredHistory[filteredHistory.length - 1];
                    const cleanedContent = cleanResponseForDisplay(lastAIMessage.content);
                    $('#chatbox').append(`<div class="message assistant-message">${cleanedContent}</div>`);
                    
                    // 엔딩이 아닌 경우에만 버튼 생성
                    if (!GameChat.checkForEnding(lastAIMessage.content)) {
                        const buttons = createChoiceButtons(lastAIMessage.content);
                        if (buttons) {
                            $('#chatbox').append(buttons);
                        }
                    }
                }
            }
            
            $('#assistant-select').prop('disabled', true);
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
        } else {
            $('#chatbox').empty().append(`<div class="message error">게임을 불러오는 중 오류: ${data.error}</div>`);
        }
    }
    
    // 응답 텍스트 정리 (표시용)
    function cleanResponseForDisplay(response) {
        let cleaned = response;
        
        // 선택지 패턴 제거
        cleaned = cleaned.replace(/[↑↓←→]\s*[^\n]*\n?/g, '');
        
        // 빈 줄 정리
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        
        // 시스템 메시지 제거
        cleaned = cleaned.replace(/\[.*?\]/g, '');
        
        return cleaned.trim();
    }
    
    // 게임 엔딩 처리
    function handleGameEnding(endingData) {
        disableAllButtons();
        $('.choice-buttons').remove();
        
        setTimeout(() => {
            showEndingScreen(endingData);
        }, 1000);
    }
    
    // 엔딩 화면 표시
    function showEndingScreen(endingData) {
        const endingType = endingData.type === 'death' ? '사망' : '탈출 성공';
        const endingClass = endingData.type === 'death' ? 'death' : 'escape';
        
        let endingHtml = `
            <div class="ending-screen ${endingClass}">
                <h2>${endingType}</h2>
                <div class="ending-story">${endingData.story}</div>
                <div class="ending-actions">
                    <button id="restart-game" class="btn btn-primary">새 게임 시작</button>
                    <button id="view-all-endings" class="btn btn-secondary">엔딩 기록 보기</button>
                </div>
            </div>
        `;
        
        $('#chatbox').append(endingHtml);
        
        // 엔딩 액션 이벤트
        $('#restart-game').click(handleRestartGame);
        $('#view-all-endings').click(handleViewEndings);
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    function handleRestartGame() {
        GameState.clearGameState();
        $('#assistant-select').prop('disabled', false);
        $('#chatbox').empty();
        $('.choice-buttons').remove();
        
        $('#chatbox').append(`
            <div class="system-message">
                게임이 초기화되었습니다. '새 게임' 버튼을 눌러 로그라이크 게임을 시작하세요.
            </div>
        `);
        
        enableAllButtons();
        checkGameState();
    }
    
    return {
        initialize: initialize,
        showLoading: showLoading,
        hideLoading: hideLoading,
        setButtonLoading: setButtonLoading,
        createChoiceButtons: createChoiceButtons,
        disableAllButtons: disableAllButtons,
        enableAllButtons: enableAllButtons,
        handleGameEnding: handleGameEnding,
        showEndingScreen: showEndingScreen,
        checkGameState: checkGameState,
        updateLoadButtonState: updateLoadButtonState
    };
})();
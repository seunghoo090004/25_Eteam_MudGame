// public/javascripts/ui.js - API 연동 완전 버전 (수정됨)

const GameUI = (function() {
    // UI 초기화
    function initialize() {
        bindUIEvents();
        setupEventHandlers();
    }
    
    // 버튼 비활성화 처리
    function disableAllButtons() {
        $('#new-game, #save-game').prop('disabled', true);
        $('.game-actions button').prop('disabled', true);
        $('.choice-button').prop('disabled', true);
    }

    function enableAllButtons() {
        $('#new-game, #save-game').prop('disabled', false);
        $('.game-actions button').prop('disabled', false);
        $('.choice-button').prop('disabled', false);
    }

    // UI 이벤트 바인딩
    function bindUIEvents() {
        // 새 게임 버튼
        $('#new-game').click(handleNewGame);
        
        // 저장 버튼
        $('#save-game').click(handleSaveGame);
        
        // 로그아웃 버튼
        $('#logout-button').on('click', handleLogout);
        
        // 방향키 이벤트
        $(document).on('keydown', handleKeyDown);
        
        // 게임 재시작 버튼 (동적 생성)
        $(document).on('click', '#restart-button', handleRestartGame);
        
        // 게임 계속 진행 버튼 (동적 생성)
        $(document).on('click', '#game-continue', handleGameContinue);
    }
    
    // 이벤트 핸들러 설정
    function setupEventHandlers() {
        // 채팅 응답 이벤트
        $(document).on('chat:response', handleChatResponse);
        
        // Socket 기반 새 게임 이벤트
        $(document).on('game:new', handleSocketNewGame);
        
        // Socket 기반 게임 로드 이벤트
        $(document).on('game:load', handleSocketGameLoad);
    }
    
    // 로딩 오버레이 표시/숨김
    function showLoading(message = '처리 중입니다...') {
        $('#loading-overlay .loading-text').text(message);
        $('#loading-overlay').fadeIn(200);
    }
    
    function hideLoading() {
        $('#loading-overlay').fadeOut(200);
    }
    
    // 버튼 로딩 상태 설정
    function setButtonLoading(button, isLoading) {
        if (isLoading) {
            button.prop('disabled', true).addClass('btn-loading');
        } else {
            button.prop('disabled', false).removeClass('btn-loading');
        }
    }
    
    // 선택지 버튼 생성
    function createChoiceButtons(message) {
        $('.choice-buttons').remove();
        
        if (!GameSocket.isConnected()) {
            console.warn('소켓 연결이 끊어져 선택지를 생성할 수 없습니다.');
            
            const errorMessage = $(`
                <div class="system-message error">
                    서버 연결이 끊어져 게임을 진행할 수 없습니다.
                    <button id="manual-reconnect" class="btn btn-primary mt-2">재연결 시도</button>
                </div>
            `);
            
            errorMessage.find('#manual-reconnect').click(function() {
                $('#connection-error').text('재연결 시도 중...');
                socket.connect();
            });
            
            return errorMessage;
        }
        
        const choicePattern = /([↑↓←→])\s*([^\n↑↓←→]+)/g;
        let choices = [];
        let match;
        
        while ((match = choicePattern.exec(message)) !== null) {
            const direction = match[1];
            const fullText = match[2].trim();
            
            let number;
            switch(direction) {
                case '↑': number = '1'; break;
                case '↓': number = '2'; break;
                case '←': number = '3'; break;
                case '→': number = '4'; break;
            }
            
            choices.push({
                number: number,
                text: fullText,
                direction: direction
            });
        }
        
        console.log('찾은 선택지:', choices.length, choices);
        
        if (choices.length === 0) {
            console.warn('유효한 선택지를 찾을 수 없습니다:', message);
            
            const errorMessage = $(`
                <div class="system-message error">
                    선택지를 찾을 수 없습니다. 게임을 다시 시작해주세요.
                    <button id="restart-button" class="btn btn-primary mt-2">게임 다시 시작</button>
                    <button id="game-continue" class="btn btn-warning mt-2">계속 진행 시도</button>
                </div>
            `);
            
            return errorMessage;
        }
        
        const buttonContainer = $('<div class="choice-buttons"></div>');
        choices.forEach((choice) => {
            const button = $(`
                <button class="choice-button" data-choice="${choice.number}">
                    <span class="direction-icon">${choice.direction}</span> ${choice.text}
                </button>
            `);
            buttonContainer.append(button);
        });
        
        buttonContainer.on('click', '.choice-button', handleChoiceSelection);
        return buttonContainer;
    }
    
    // 선택지 처리
    function handleChoiceSelection(e) {
        e.preventDefault();
        
        const currentGameId = GameState.getCurrentGameId();
        
        if (!currentGameId || !GameSocket.isConnected()) {
            alert('게임 상태가 유효하지 않거나 서버 연결이 끊어졌습니다.');
            return;
        }
        
        if (GameState.isProcessingChoice()) {
            console.log('이미 선택지 처리 중입니다. 중복 선택 무시');
            return;
        }

        disableAllButtons();
        
        const selectedButton = $(this);
        const choiceNumber = selectedButton.data('choice');
        const choiceText = selectedButton.text().trim();
        
        selectedButton.addClass('processing');
        GameState.setProcessingChoice(true);
        
        $('#chatbox .message').remove();
        $('.choice-buttons').remove();
        $('.system-message').remove();
        
        $('#chatbox').append(`<div class="message user-message">${choiceText}</div>`);
        
        GameSocket.emit('chat message', {
            message: choiceNumber,
            game_id: currentGameId
        });
        
        $('#chatbox').append(`<div id="waiting-response" class="system-message">서버 응답 대기 중...</div>`);
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    // 버튼 하이라이트 효과
    function highlightButton(index) {
        $('.choice-button').removeClass('highlight-button');
        $('.choice-button').eq(index).addClass('highlight-button');
        
        setTimeout(function() {
            $('.choice-button').removeClass('highlight-button');
        }, 300);
    }
    
    // 방향키 이벤트 처리
    function handleKeyDown(e) {
        if (GameState.isProcessingChoice() || $('.choice-button').length === 0) {
            return;
        }
        
        const enabledButtons = $('.choice-button:not(:disabled)');
        if (enabledButtons.length === 0) return;
        
        switch(e.key) {
            case 'ArrowUp':
                highlightButton(0);
                setTimeout(function() {
                    enabledButtons.eq(0).trigger('click');
                }, 100);
                break;
            case 'ArrowDown':
                highlightButton(1);
                setTimeout(function() {
                    enabledButtons.eq(1).trigger('click');
                }, 100);
                break;
            case 'ArrowLeft':
                highlightButton(2);
                setTimeout(function() {
                    enabledButtons.eq(2).trigger('click');
                }, 100);
                break;
            case 'ArrowRight':
                highlightButton(3);
                setTimeout(function() {
                    enabledButtons.eq(3).trigger('click');
                }, 100);
                break;
        }
    }
    
    // ✅ API: 새 게임 처리
    async function handleNewGame() {
        if (GameState.getCurrentGameId() && !confirm('새 게임을 시작하시겠습니까?')) return;
        
        disableAllButtons();
        setButtonLoading($('#new-game'), true);
        showLoading('새 게임을 시작하는 중...');
        
        try {
            const assistant_id = $('#assistant-select').val();
            const response = await GameAPI.game.create(assistant_id);
            
            if (response.code === "result" && response.value === 1) {
                handleNewGameSuccess(response.value_ext2);
            } else {
                throw new Error(response.value_ext2 || '게임 생성에 실패했습니다.');
            }
        } catch (error) {
            console.error('새 게임 생성 오류:', error);
            hideLoading();
            setButtonLoading($('#new-game'), false);
            enableAllButtons();
            alert('새 게임 생성 중 오류: ' + (error.message || error));
        }
    }
    
    // ✅ 수정: 새 게임 성공 처리 (thread_id 포함)
    function handleNewGameSuccess(gameInfo) {
        hideLoading();
        setButtonLoading($('#new-game'), false);
        
        GameState.setGameState(gameInfo.game_id, gameInfo.game_data);
        
        $('#chatbox').empty();
        $('#chatbox').append(`<div class="message system-message">새 게임이 시작되었습니다! Socket.IO를 통해 초기 메시지를 받아오는 중...</div>`);
        
        $('#assistant-select').prop('disabled', true);
        enableAllButtons();
        
        loadGamesList(true);
        
        // ✅ 수정: Socket.IO를 통해 초기 메시지 받기 - thread_id 포함
        GameSocket.emit('new game', {
            assistant_id: $('#assistant-select').val(),
            thread_id: gameInfo.thread_id,      // ✅ 추가
            game_id: gameInfo.game_id,          // ✅ 추가
            game_data: gameInfo.game_data       // ✅ 추가
        });
    }
    
    // ✅ API: 게임 저장 처리
    async function handleSaveGame() {
        const currentGameId = GameState.getCurrentGameId();
        const gameData = GameState.getGameData();
        
        if (!currentGameId || !gameData) {
            alert('저장할 게임이 없습니다.');
            return;
        }
        
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 저장해주세요.');
            return;
        }
        
        disableAllButtons();
        setButtonLoading($('#save-game'), true);
        showLoading('게임을 저장하는 중...');
        
        try {
            const response = await GameAPI.game.save(currentGameId, gameData);
            
            if (response.code === "result" && response.value === 1) {
                handleSaveGameSuccess(response.value_ext2);
            } else {
                throw new Error(response.value_ext2 || '게임 저장에 실패했습니다.');
            }
        } catch (error) {
            console.error('게임 저장 오류:', error);
            hideLoading();
            setButtonLoading($('#save-game'), false);
            enableAllButtons();
            alert('게임 저장 중 오류: ' + (error.message || error));
        }
    }
    
    // 게임 저장 성공 처리
    function handleSaveGameSuccess(saveInfo) {
        hideLoading();
        setButtonLoading($('#save-game'), false);
        enableAllButtons();
        
        alert('게임이 저장되었습니다!');
        
        $('#chatbox').empty();
        $('#chatbox').append(`<div class="message user-message">이전 게임 요약: ${saveInfo.summary}</div>`);
        $('#chatbox').append(`<div class="message assistant-message">${saveInfo.initial_response}</div>`);
        
        const buttons = createChoiceButtons(saveInfo.initial_response);
        if (buttons) {
            $('#chatbox').append(buttons);
        }
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
        loadGamesList(true);
    }
    
    // 로그아웃 처리
    function handleLogout(e) {
        e.preventDefault();
        if (confirm('정말 로그아웃 하시겠습니까?')) {
            window.location.href = '/auth/logout';
        }
    }
    
    // 게임 재시작 처리
    function handleRestartGame() {
        console.log('게임 다시 시작');
        
        disableAllButtons();
        setTimeout(enableAllButtons, 100);
        
        $('#assistant-select').prop('disabled', false);
        $('#chatbox').empty();
        
        GameState.clearGameState();
        $('.choice-buttons').remove();
        
        $('#chatbox').append(`
            <div class="system-message">
                게임이 초기화되었습니다. '새 게임' 버튼을 눌러 게임을 시작하세요.
            </div>
        `);
    }
    
    // 게임 계속 진행 처리
    function handleGameContinue() {
        disableAllButtons();
        
        const defaultChoices = [
            { number: '1', text: '계속 진행하기' },
            { number: '2', text: '다른 방향으로 탐색하기' },
            { number: '3', text: '이전 행동 반복하기' },
            { number: '4', text: '잠시 휴식하기' }
        ];
        
        const buttonContainer = $('<div class="choice-buttons"></div>');
        defaultChoices.forEach((choice, index) => {
            const directionIcons = ['↑', '↓', '←', '→'];
            const directionIcon = directionIcons[index];
            
            const button = $(`
                <button class="choice-button" data-choice="${choice.number}">
                    <span class="direction-icon">${directionIcon}</span> ${choice.number}. ${choice.text}
                </button>
            `);
            
            buttonContainer.append(button);
        });
        
        buttonContainer.on('click', '.choice-button', handleChoiceSelection);
        $(this).closest('.system-message').replaceWith(buttonContainer);
        
        setTimeout(enableAllButtons, 100);
    }
    
    // Socket 채팅 응답 처리
    function handleChatResponse(event, data) {
        $('#waiting-response').remove();
        GameState.setProcessingChoice(false);
        enableAllButtons();

        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            $('#chatbox').append(`<div class="message assistant-message">${data.response}</div>`);
            console.log('AI 응답:', data.response);
            
            try {
                const buttons = createChoiceButtons(data.response);
                if (buttons) {
                    $('#chatbox').append(buttons);
                }
                
                if (data.game_state) {
                    console.log('게임 상태 업데이트:', data.game_state);
                    GameState.setGameState(GameState.getCurrentGameId(), data.game_state);
                }
            } catch (error) {
                console.error('선택지 처리 오류:', error);
                $('#chatbox').append(`
                    <div class="system-message error">
                        선택지 처리 중 오류가 발생했습니다: ${error.message}
                        <button id="restart-button" class="btn btn-primary mt-2">게임 다시 시작</button>
                    </div>
                `);
            }
        } else {
            hideLoading();
            $('#chatbox').append(`
                <div class="message error">
                    오류: ${data.error}
                    <button id="restart-button" class="btn btn-danger mt-2">게임 다시 시작</button>
                </div>
            `);
        }
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    // Socket 새 게임 응답 처리
    function handleSocketNewGame(event, data) {
        setButtonLoading($('#new-game'), false);
        
        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            GameState.setGameState(data.game_id, data.game_data);
            
            $('#chatbox').empty();
            
            if (data.initial_message) {
                $('#chatbox').append(`<div class="message assistant-message">${data.initial_message}</div>`);
                
                try {
                    const buttons = createChoiceButtons(data.initial_message);
                    if (buttons) {
                        $('#chatbox').append(buttons);
                    }
                } catch (error) {
                    console.error('초기 선택지 처리 오류:', error);
                    $('#chatbox').append(`
                        <div class="system-message error">
                            선택지 처리 중 오류가 발생했습니다: ${error.message}
                            <button id="restart-button" class="btn btn-primary mt-2">게임 다시 시작</button>
                        </div>
                    `);
                }
            } else {
                $('#chatbox').append(`
                    <div class="system-message">
                        게임이 시작되었지만 초기 메시지를 받지 못했습니다.
                        <button id="restart-button" class="btn btn-primary mt-2">게임 다시 시작</button>
                    </div>
                `);
            }
            
            $('#assistant-select').prop('disabled', true);
            enableAllButtons();
            
            setTimeout(() => {
                if (!$('#saved_games_list').children().length) {
                    loadGamesList();
                }
            }, 1000);
        } else {
            hideLoading();
            enableAllButtons();
            alert(data.error || '게임 시작 중 오류가 발생했습니다.');
        }
    }
    
    // Socket 게임 로드 응답 처리
    function handleSocketGameLoad(event, data) {
        hideLoading();
        enableAllButtons();
        
        if (data.success) {
            GameState.setGameState(data.game.game_id, data.game.game_data);
            
            $('#chatbox').empty();
            
            if (data.game.chatHistory && data.game.chatHistory.length > 0) {
                const chatHistory = [...data.game.chatHistory].sort((a, b) => {
                    const dateA = new Date(a.created_at);
                    const dateB = new Date(b.created_at);
                    return dateA - dateB;
                });
                
                const lastAIMessage = chatHistory.reverse().find(msg => msg.role === 'assistant');
                
                if (lastAIMessage) {
                    $('#chatbox').append(`<div class="message assistant-message">${lastAIMessage.content}</div>`);
                    
                    console.log('Creating choice buttons for last AI message');
                    const buttons = createChoiceButtons(lastAIMessage.content);
                    if (buttons) {
                        $('#chatbox').append(buttons);
                    } else {
                        console.warn('Failed to create choice buttons');
                    }
                } else {
                    $('#chatbox').append(`<div class="system-message">게임을 이어서 진행합니다...</div>`);
                }
            } else {
                $('#chatbox').append(`<div class="system-message">게임을 이어서 진행합니다...</div>`);
            }
            
            $('#assistant-select').prop('disabled', true);
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
        } else {
            $('#chatbox').empty().append(`<div class="message error">게임을 불러오는 중 오류: ${data.error}</div>`);
        }
    }
    
    // ✅ API: 게임 목록 로드
    async function loadGamesList(forceRefresh = false) {
        try {
            if (forceRefresh) {
                const savedGamesList = $('#saved_games_list');
                savedGamesList.empty();
                savedGamesList.append('<p>게임 목록 업데이트 중...</p>');
            }
            
            const response = await GameAPI.game.list();
            
            if (response.code === "result" && response.value >= 0) {
                handleGamesListSuccess(response.value_ext2.games, forceRefresh);
            } else {
                throw new Error(response.value_ext2 || '게임 목록을 불러올 수 없습니다.');
            }
        } catch (error) {
            console.error('게임 목록 로드 오류:', error);
            $('#saved_games_list').html('<p>게임 목록을 불러오는 중 오류가 발생했습니다.</p>');
        }
    }
    
    // 게임 목록 성공 처리
    function handleGamesListSuccess(games, forceRefresh = false) {
        const savedGamesList = $('#saved_games_list');
        savedGamesList.empty();

        if (games.length === 0) {
            savedGamesList.append('<p>저장된 게임이 없습니다.</p>');
            return;
        }

        console.log('불러온 게임 목록:', games);

        games.forEach(function(game) {
            const gameDate = new Date(game.last_updated).toLocaleString();
            const gameData = game.game_data || {};
            const player = gameData.player || {};
            const location = gameData.location || {};
            const inventory = gameData.inventory || {};
            const progress = gameData.progress || {};
            
            const currentLocation = location.current || "알 수 없음";
            const health = player.health || 100;
            const maxHealth = player.maxHealth || 100;
            const status = player.status || '양호';
            const keyItems = inventory.keyItems || '없음';
            const playTime = progress.playTime || "방금 시작";
            const deathCount = progress.deathCount || 0;
            
            let statusIcon = '✅';
            if (health <= 20) statusIcon = '🔥';
            else if (health <= 50) statusIcon = '⚠️';
            
            const isCurrentGame = (game.game_id === GameState.getCurrentGameId());
            const highlightClass = isCurrentGame ? 'current-game' : '';
            
            savedGamesList.append(`
                <div class="game-entry ${highlightClass}" data-game-id="${game.game_id}">
                    <span><strong>마지막 저장:</strong> ${gameDate}</span>
                    <span class="location-info"><strong>위치:</strong> ${currentLocation}</span>
                    <span>❤️ ${health}/${maxHealth} 🧠 ${status} 💰 ${keyItems}</span>
                    <span>⏰ 플레이시간: ${playTime}</span>
                    ${deathCount > 0 ? `<span>💀 사망: ${deathCount}회</span>` : ''}
                    <div class="game-actions">
                        <button class="btn btn-primary" onclick="loadGame('${game.game_id}')">불러오기</button>
                        <button class="btn btn-danger" onclick="deleteGame('${game.game_id}')" style="margin-left: 5px;">삭제</button>
                    </div>
                </div>
            `);
        });
        
        if (GameState.getCurrentGameId()) {
            const currentGameElement = $(`.game-entry[data-game-id="${GameState.getCurrentGameId()}"]`);
            if (currentGameElement.length) {
                $('#game-load-list').scrollTop(currentGameElement.position().top);
            }
        }
    }
    
    // 공개 API
    return {
        initialize: initialize,
        showLoading: showLoading,
        hideLoading: hideLoading,
        setButtonLoading: setButtonLoading,
        createChoiceButtons: createChoiceButtons,
        disableAllButtons: disableAllButtons,
        enableAllButtons: enableAllButtons,
        loadGamesList: loadGamesList
    };
})();
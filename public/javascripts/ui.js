// public/javascripts/ui.js - 선택지 제거 및 UI 업데이트

const GameUI = (function() {
    let gameExists = false;
    
    function initialize() {
        setupGlobalEventHandlers();
        setupEventHandlers();
        checkGameState();
    }
    
    function setupGlobalEventHandlers() {
        $(document).on('click', '#new-game', handleNewGame);
        $(document).on('click', '#load-game', handleLoadGame);
        $(document).on('click', '#delete-game', handleDeleteGame);
        $(document).on('click', '#logout', handleLogout);
        $(document).on('keydown', handleKeyDown);
        $(document).on('click', '#restart-button', handleRestartGame);
        $(document).on('click', '#game-continue', handleGameContinue);
    }
    
    function setupEventHandlers() {
        $(document).on('chat:response', handleChatResponse);
        $(document).on('game:new', handleSocketNewGame);
        $(document).on('game:load', handleSocketGameLoad);
    }
    
    function showLoading(message = '처리 중입니다...') {
        $('#loading-overlay .loading-text').text(message);
        $('#loading-overlay').fadeIn(200);
    }
    
    function hideLoading() {
        $('#loading-overlay').fadeOut(200);
    }
    
    function setButtonLoading(button, isLoading) {
        if (isLoading) {
            button.prop('disabled', true).addClass('btn-loading');
        } else {
            button.prop('disabled', false).removeClass('btn-loading');
        }
    }
    
    // AI 응답에서 선택지 제거하여 표시
    function cleanResponseForDisplay(response) {
        if (!response) return '';
        
        // 선택지 패턴 제거 (↑ ↓ ← → 로 시작하는 라인들)
        const choicePattern = /[↑↓←→]\s*[^\n]+/g;
        const cleanResponse = response.replace(choicePattern, '').trim();
        
        // 연속된 줄바꿈 정리
        return cleanResponse.replace(/\n{3,}/g, '\n\n');
    }
    
    function createChoiceButtons(message) {
        $('.choice-buttons').remove();
        
        if (!GameSocket.isConnected()) {
            return $(`
                <div class="system-message error">
                    서버 연결이 끊어져 게임을 진행할 수 없습니다.
                    <button id="manual-reconnect" class="btn btn-primary mt-2">재연결 시도</button>
                </div>
            `);
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
        
        if (choices.length === 0) {
            return $(`
                <div class="system-message error">
                    선택지를 찾을 수 없습니다. 게임을 다시 시작해주세요.
                    <button id="restart-button" class="btn btn-primary mt-2">게임 다시 시작</button>
                </div>
            `);
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
    
    function handleChoiceSelection(e) {
        e.preventDefault();
        
        const currentGameId = GameState.getCurrentGameId();
        
        if (!currentGameId || !GameSocket.isConnected()) {
            alert('게임 상태가 유효하지 않거나 서버 연결이 끊어졌습니다.');
            return;
        }
        
        if (GameState.isProcessingChoice()) {
            return;
        }

        disableAllButtons();
        
        const selectedButton = $(this);
        const choiceNumber = selectedButton.data('choice');
        const choiceText = selectedButton.text().trim();
        
        selectedButton.addClass('processing');
        GameState.setProcessingChoice(true);
        
        $('.choice-buttons').remove();
        $('.system-message').remove();
        $('.message.user-message').remove();
        
        $('#chatbox').append(`<div class="message user-message">${choiceText}</div>`);
        
        GameState.incrementTurn();
        
        GameSocket.emit('chat message', {
            message: choiceNumber,
            game_id: currentGameId
        });
        
        $('#chatbox').append(`<div id="waiting-response" class="system-message">턴 ${GameState.getGameData()?.turn_count || '?'} 처리 중...</div>`);
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    function handleChatResponse(event, data) {
        GameState.setProcessingChoice(false);
        $('#waiting-response').remove();
        
        if (data.success) {
            const response = data.response;
            
            // 깨끗한 응답 표시 (선택지 제거)
            const cleanResponse = cleanResponseForDisplay(response);
            $('#chatbox').append(`<div class="message assistant-message">${cleanResponse}</div>`);
            
            // 게임 상태 업데이트
            if (data.game_state) {
                const parsedState = GameState.parseStatsFromResponse(response);
                if (parsedState) {
                    GameState.updateGameStateFromParsing(parsedState);
                }
            }
            
            // 엔딩 체크
            const endingData = GameState.checkEndingConditions(response);
            if (endingData) {
                handleGameEnding(endingData);
                return;
            }
            
            // 선택지 버튼 생성
            const buttons = createChoiceButtons(response);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
            
            enableAllButtons();
            
        } else {
            $('#chatbox').append(`<div class="message error">오류: ${data.error || '알 수 없는 오류'}</div>`);
            enableAllButtons();
        }
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    async function handleNewGame() {
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        const assistantId = $('#assistant-select').val();
        if (!assistantId) {
            alert('어시스턴트를 선택해주세요.');
            return;
        }
        
        disableAllButtons();
        setButtonLoading($('#new-game'), true);
        showLoading('새 게임을 생성하는 중...');
        
        try {
            const response = await GameAPI.game.create(assistantId, 'roguelike');
            
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
    
    function handleNewGameSuccess(gameInfo) {
        hideLoading();
        setButtonLoading($('#new-game'), false);
        
        GameState.setGameState(gameInfo.game_id, gameInfo.game_data, true);
        
        $('#chatbox').empty();
        $('#chatbox').append(`<div class="message system-message">새 로그라이크 게임이 시작되었습니다...</div>`);
        
        $('#assistant-select').prop('disabled', true);
        enableAllButtons();
        
        GameSocket.emit('new game', {
            assistant_id: $('#assistant-select').val(),
            thread_id: gameInfo.thread_id,
            game_id: gameInfo.game_id,
            game_data: gameInfo.game_data
        });
    }
    
    async function handleLoadGame() {
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        if (!gameExists) {
            alert('불러올 수 있는 게임이 없습니다.');
            return;
        }
        
        disableAllButtons();
        setButtonLoading($('#load-game'), true);
        showLoading('게임을 불러오는 중...');
        
        try {
            const response = await GameAPI.game.loadCurrent();
            
            if (response.code === "result" && response.value === 1) {
                handleLoadGameSuccess(response.value_ext2.game);
            } else {
                throw new Error(response.value_ext2 || '불러올 게임이 없습니다.');
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
    
    function handleLoadGameSuccess(game) {
        hideLoading();
        setButtonLoading($('#load-game'), false);
        
        GameState.setGameState(game.game_id, game.game_data);
        gameExists = true;
        updateLoadButtonState(true);
        
        $('#assistant-select').prop('disabled', true);
        enableAllButtons();
        
        GameSocket.emit('load game', {
            game_id: game.game_id
        });
    }
    
    function handleSocketNewGame(event, data) {
        setButtonLoading($('#new-game'), false);
        
        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            GameState.setGameState(data.game_id, data.game_data);
            
            $('.system-message').remove();
            
            if (data.initial_message) {
                const cleanResponse = cleanResponseForDisplay(data.initial_message);
                $('#chatbox').append(`<div class="message assistant-message">${cleanResponse}</div>`);
                
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
                    const cleanResponse = cleanResponseForDisplay(lastAIMessage.content);
                    $('#chatbox').append(`<div class="message assistant-message">${cleanResponse}</div>`);
                    
                    const buttons = createChoiceButtons(lastAIMessage.content);
                    if (buttons) {
                        $('#chatbox').append(buttons);
                    }
                }
            }
            
            $('#assistant-select').prop('disabled', true);
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
        } else {
            $('#chatbox').empty().append(`<div class="message error">게임을 불러오는 중 오류: ${data.error}</div>`);
        }
    }
    
    function handleGameEnding(endingData) {
        showEndingScreen(endingData);
    }
    
    function showEndingScreen(endingData) {
        console.log('Showing ending screen:', endingData);
        
        GameAPI.game.ending.create(GameState.getCurrentGameId(), endingData)
            .then(response => {
                if (response.code === "result") {
                    window.location.href = `/ending/${GameState.getCurrentGameId()}`;
                } else {
                    console.error('엔딩 저장 실패:', response);
                    alert('엔딩 저장 중 오류가 발생했습니다.');
                }
            })
            .catch(error => {
                console.error('엔딩 저장 오류:', error);
                alert('엔딩 저장 중 오류가 발생했습니다.');
            });
    }
    
    async function checkGameState() {
        try {
            const response = await GameAPI.game.loadCurrent();
            gameExists = response.code === "result" && response.value === 1;
            updateLoadButtonState(gameExists);
        } catch (error) {
            gameExists = false;
            updateLoadButtonState(false);
        }
    }
    
    function updateLoadButtonState(exists) {
        const loadButton = $('#load-game');
        if (exists) {
            loadButton.prop('disabled', false).text('게임 불러오기');
        } else {
            loadButton.prop('disabled', true).text('저장된 게임 없음');
        }
    }
    
    function disableAllButtons() {
        $('button').prop('disabled', true);
        $('.choice-button').prop('disabled', true);
    }
    
    function enableAllButtons() {
        $('button').prop('disabled', false);
        $('.choice-button').prop('disabled', false);
        updateLoadButtonState(gameExists);
    }
    
    function handleDeleteGame() {
        if (!confirm('정말로 현재 게임을 삭제하시겠습니까?')) return;
        
        GameAPI.game.deleteCurrent()
            .then(() => {
                GameState.clearGameState();
                $('#chatbox').empty();
                $('#assistant-select').prop('disabled', false);
                gameExists = false;
                updateLoadButtonState(false);
                alert('게임이 삭제되었습니다.');
            })
            .catch(error => {
                console.error('게임 삭제 오류:', error);
                alert('게임 삭제 중 오류가 발생했습니다.');
            });
    }
    
    function handleLogout() {
        window.location.href = '/auth/logout';
    }
    
    function handleKeyDown(e) {
        if (e.ctrlKey && e.key === 'Enter') {
            const visibleChoices = $('.choice-button:visible');
            if (visibleChoices.length > 0) {
                visibleChoices.first().click();
            }
        }
    }
    
    function handleRestartGame() {
        if (confirm('새 게임을 시작하시겠습니까?')) {
            $('#new-game').click();
        }
    }
    
    function handleGameContinue() {
        $('#load-game').click();
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
        updateLoadButtonState: updateLoadButtonState,
        cleanResponseForDisplay: cleanResponseForDisplay
    };
})();
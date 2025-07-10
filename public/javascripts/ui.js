// public/javascripts/ui.js - 수정된 버전

const GameUI = (function() {
    function initialize() {
        bindUIEvents();
        setupEventHandlers();
    }
    
    function disableAllButtons() {
        $('#new-game, #load-game, #view-endings').prop('disabled', true);
        $('.choice-button').prop('disabled', true);
    }

    function enableAllButtons() {
        $('#new-game, #load-game, #view-endings').prop('disabled', false);
        $('.choice-button').prop('disabled', false);
    }

    function bindUIEvents() {
        $('#new-game').click(handleNewGame);
        $('#load-game').click(handleLoadGame);
        $('#view-endings').click(handleViewEndings);
        $('#logout-button').on('click', handleLogout);
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
        
        $('#chatbox').append(`<div id="waiting-response" class="system-message">턴 ${GameState.getGameData()?.turn_count || '?'} - 응답 대기 중...</div>`);
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    function handleChatResponse(event, data) {
        $('#waiting-response').remove();
        GameState.setProcessingChoice(false);
        enableAllButtons();

        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            $('.message.assistant-message').last().remove();
            $('.choice-buttons').remove();
            $('.system-message').remove();
            $('.message.user-message:not(:last)').remove();
            
            const endingCondition = GameState.checkEndingConditions(data.response);
            
            if (endingCondition) {
                handleGameEnding(endingCondition, data.response);
                return;
            }
            
            $('#chatbox').append(`<div class="message assistant-message">${data.response}</div>`);
            
            const buttons = createChoiceButtons(data.response);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
            
            const parsedState = GameState.parseStatsFromResponse(data.response);
            if (parsedState) {
                GameState.updateGameStateFromParsing(parsedState);
            }
            
            if (data.game_state) {
                GameState.setGameState(GameState.getCurrentGameId(), data.game_state);
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
    
    async function handleGameEnding(endingCondition, aiResponse) {
        const currentGameId = GameState.getCurrentGameId();
        const gameData = GameState.getGameData();
        
        try {
            showLoading('엔딩을 처리하는 중...');
            
            const gameListResponse = await GameAPI.game.ending.list();
            let totalDeaths = 0;
            
            if (gameListResponse.code === "result") {
                const deathGames = gameListResponse.value_ext2.endings.filter(
                    ending => ending.ending_type === 'death'
                ).length;
                
                totalDeaths = endingCondition.type === 'death' ? deathGames + 1 : deathGames;
            }
            
            let endingStory = generateEndingStory(endingCondition, gameData, aiResponse, totalDeaths);
            
            const endingData = {
                ending_type: endingCondition.type,
                final_turn: endingCondition.final_turn,
                total_deaths: totalDeaths,
                discoveries: [],
                discoveries_count: 0,
                cause_of_death: endingCondition.cause || null,
                ending_story: endingStory,
                completed_at: new Date().toISOString()
            };
            
            const response = await GameAPI.game.ending.create(currentGameId, endingData);
            
            if (response.code === "result" && response.value === 1) {
                hideLoading();
                showEndingScreen(endingData, aiResponse);
            } else {
                throw new Error(response.value_ext2 || '엔딩 처리 실패');
            }
            
        } catch (error) {
            hideLoading();
            console.error('엔딩 처리 오류:', error);
            $('#chatbox').append(`
                <div class="message error">
                    엔딩 처리 중 오류가 발생했습니다: ${error.message}
                    <button id="restart-button" class="btn btn-primary mt-2">새 게임 시작</button>
                </div>
            `);
        }
    }
    
    function generateEndingStory(endingCondition, gameData, aiResponse, totalDeaths) {
        const turn = endingCondition.final_turn;
        let story = '';
        
        if (endingCondition.type === 'death') {
            story = `던전의 어둠 속에서 ${turn}턴 만에 생을 마감했습니다.\n\n`;
            story += `사망 원인: ${endingCondition.cause}\n`;
            story += `총 사망 횟수: ${totalDeaths}회\n\n`;
            
            if (turn <= 3) {
                story += "초반 함정에 걸려 빠른 죽음을 맞이했습니다.";
            } else if (turn <= 6) {
                story += "중반까지 진행했지만 위험을 극복하지 못했습니다.";
            } else if (turn <= 10) {
                story += "후반까지 생존했지만 최고 난이도를 넘지 못했습니다.";
            } else {
                story += "탈출 구간에서 사망했습니다. 거의 성공에 가까웠습니다.";
            }
        } else if (endingCondition.type === 'escape') {
            story = `축하합니다! ${turn}턴 만에 던전 탈출에 성공했습니다!\n\n`;
            story += `최종 턴: ${turn}턴\n`;
            story += `총 사망 횟수: ${totalDeaths}회\n\n`;
            
            if (totalDeaths === 0) {
                story += "완벽한 플레이! 전설적인 모험가입니다.";
            } else if (totalDeaths <= 2) {
                story += "최소한의 희생으로 탈출에 성공했습니다.";
            } else {
                story += "수많은 시행착오를 거쳐 마침내 탈출했습니다.";
            }
        }
        
        return story;
    }
    
    function showEndingScreen(endingData, aiResponse) {
        $('#chatbox').empty();
        
        const endingTypeText = endingData.ending_type === 'death' ? '사망' : 
                              endingData.ending_type === 'escape' ? '탈출 성공' : '게임 종료';
        
        const endingColor = endingData.ending_type === 'death' ? '#dc3545' : 
                           endingData.ending_type === 'escape' ? '#28a745' : '#6c757d';
        
        $('#chatbox').append(`
            <div class="ending-screen">
                <div class="ending-header" style="background-color: ${endingColor}; color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 10px;">
                    <h2>게임 종료 - ${endingTypeText}</h2>
                </div>
                
                <div class="message assistant-message ending-response">
                    ${aiResponse}
                </div>
                
                <div class="ending-stats" style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h4>게임 통계</h4>
                    <p><strong>최종 턴:</strong> ${endingData.final_turn}턴</p>
                    <p><strong>총 사망 횟수:</strong> ${endingData.total_deaths}회</p>
                    ${endingData.cause_of_death ? `<p><strong>사망 원인:</strong> ${endingData.cause_of_death}</p>` : ''}
                </div>
                
                <div class="ending-story" style="background: #e9ecef; padding: 15px; border-radius: 8px; margin: 20px 0; white-space: pre-line;">
                    ${endingData.ending_story}
                </div>
                
                <div class="ending-actions" style="text-align: center; margin-top: 30px;">
                    <button id="new-game-ending" class="btn btn-primary" style="margin: 5px;">새 게임 시작</button>
                    <button id="view-endings-ending" class="btn btn-secondary" style="margin: 5px;">엔딩 기록 보기</button>
                    <button id="back-to-main" class="btn btn-info" style="margin: 5px;">메인으로</button>
                </div>
            </div>
        `);
        
        $('#new-game-ending').click(async function() {
            try {
                await GameAPI.game.deleteCurrent();
                GameState.clearGameState();
                $('#chatbox').empty();
                $('#assistant-select').prop('disabled', false);
                handleNewGame();
            } catch (error) {
                console.error('게임 삭제 오류:', error);
                handleNewGame();
            }
        });
        
        $('#view-endings-ending').click(async function() {
            try {
                await GameAPI.game.deleteCurrent();
                GameState.clearGameState();
                window.open('/endings', '_blank');
            } catch (error) {
                console.error('게임 삭제 오류:', error);
                window.open('/endings', '_blank');
            }
        });
        
        $('#back-to-main').click(async function() {
            try {
                await GameAPI.game.deleteCurrent();
                GameState.clearGameState();
                location.reload();
            } catch (error) {
                console.error('게임 삭제 오류:', error);
                location.reload();
            }
        });
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    async function handleNewGame() {
        try {
            // 기존 게임 삭제
            await GameAPI.game.deleteCurrent();
        } catch (error) {
            console.log('기존 게임 없음 또는 삭제 완료');
        }
        
        if (GameState.getCurrentGameId() && !confirm('새 게임을 시작하시겠습니까?')) return;
        
        disableAllButtons();
        setButtonLoading($('#new-game'), true);
        showLoading('새 로그라이크 게임을 시작하는 중...');
        
        try {
            const assistant_id = $('#assistant-select').val();
            const response = await GameAPI.game.create(assistant_id, 'roguelike');
            
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
            enableAllButtons();
            alert('게임 로드 중 오류: ' + (error.message || error));
        }
    }
    
    function handleLoadGameSuccess(gameData) {
        hideLoading();
        setButtonLoading($('#load-game'), false);
        enableAllButtons();
        
        GameState.setGameState(gameData.game_id, gameData.game_data);
        
        $('#chatbox').empty();
        
        if (gameData.chatHistory && gameData.chatHistory.length > 0) {
            const chatHistory = [...gameData.chatHistory].sort((a, b) => {
                return new Date(a.created_at) - new Date(b.created_at);
            });
            
            const lastAIMessage = chatHistory.reverse().find(msg => msg.role === 'assistant');
            
            if (lastAIMessage) {
                $('#chatbox').append(`<div class="message assistant-message">${lastAIMessage.content}</div>`);
                
                const buttons = createChoiceButtons(lastAIMessage.content);
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
    
    function handleViewEndings() {
        window.open('/endings', '_blank');
    }
    
    function handleLogout(e) {
        e.preventDefault();
        if (confirm('정말 로그아웃 하시겠습니까?')) {
            window.location.href = '/auth/logout';
        }
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
    }
    
    function handleGameContinue() {
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
                    <span class="direction-icon">${directionIcon}</span> ${choice.text}
                </button>
            `);
            buttonContainer.append(button);
        });
        
        buttonContainer.on('click', '.choice-button', handleChoiceSelection);
        $(this).closest('.system-message').replaceWith(buttonContainer);
        
        enableAllButtons();
    }
    
    function handleKeyDown(e) {
        if (GameState.isProcessingChoice() || $('.choice-button').length === 0) return;
        
        const enabledButtons = $('.choice-button:not(:disabled)');
        if (enabledButtons.length === 0) return;
        
        switch(e.key) {
            case 'ArrowUp':
                enabledButtons.eq(0).trigger('click');
                break;
            case 'ArrowDown':
                enabledButtons.eq(1).trigger('click');
                break;
            case 'ArrowLeft':
                enabledButtons.eq(2).trigger('click');
                break;
            case 'ArrowRight':
                enabledButtons.eq(3).trigger('click');
                break;
        }
    }
    
    function handleSocketNewGame(event, data) {
        setButtonLoading($('#new-game'), false);
        
        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            GameState.setGameState(data.game_id, data.game_data);
            
            $('.system-message').remove();
            
            if (data.initial_message) {
                $('#chatbox').append(`<div class="message assistant-message">${data.initial_message}</div>`);
                
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
                    $('#chatbox').append(`<div class="message assistant-message">${lastAIMessage.content}</div>`);
                    
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
    
    return {
        initialize: initialize,
        showLoading: showLoading,
        hideLoading: hideLoading,
        setButtonLoading: setButtonLoading,
        createChoiceButtons: createChoiceButtons,
        disableAllButtons: disableAllButtons,
        enableAllButtons: enableAllButtons,
        handleGameEnding: handleGameEnding,
        showEndingScreen: showEndingScreen
    };
})();
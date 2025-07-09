// public/javascripts/ui.js - 로그라이크 엔딩 시스템 (수정됨)

const GameUI = (function() {
    function initialize() {
        bindUIEvents();
        setupEventHandlers();
    }
    
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

    function bindUIEvents() {
        $('#new-game').click(handleNewGame);
        $('#save-game').click(handleSaveGame);
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
        
        // 화면 정리
        $('.choice-buttons').remove();
        $('.system-message').remove();
        $('.message.user-message').remove();
        
        $('#chatbox').append(`<div class="message user-message">${choiceText}</div>`);
        
        // 턴 증가
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
            
            // 메시지 정리
            $('.message.assistant-message').last().remove();
            $('.choice-buttons').remove();
            $('.system-message').remove();
            $('.message.user-message:not(:last)').remove();
            
            // 엔딩 조건 체크
            const endingCondition = GameState.checkEndingConditions(data.response);
            
            if (endingCondition) {
                // 엔딩 처리
                handleGameEnding(endingCondition, data.response);
                return;
            }
            
            // 새로운 AI 메시지 추가
            $('#chatbox').append(`<div class="message assistant-message">${data.response}</div>`);
            
            const buttons = createChoiceButtons(data.response);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
            
            // 게임 상태 파싱 및 업데이트
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
    
    // 엔딩 처리 (수정됨 - 누적 사망 횟수 계산)
    async function handleGameEnding(endingCondition, aiResponse) {
        const currentGameId = GameState.getCurrentGameId();
        const gameData = GameState.getGameData();
        
        try {
            showLoading('엔딩을 처리하는 중...');
            
            // 현재 사용자의 총 사망 횟수 가져오기
            const gameListResponse = await GameAPI.game.ending.list();
            let totalDeaths = 0;
            
            if (gameListResponse.code === "result") {
                // 기존 사망 게임 수 계산
                const deathGames = gameListResponse.value_ext2.endings.filter(
                    ending => ending.ending_type === 'death'
                ).length;
                
                // 현재 게임이 사망이면 +1
                totalDeaths = endingCondition.type === 'death' ? deathGames + 1 : deathGames;
            }
            
            // 엔딩 스토리 생성
            let endingStory = generateEndingStory(endingCondition, gameData, aiResponse, totalDeaths);
            
            const endingData = {
                ending_type: endingCondition.type,
                final_turn: endingCondition.final_turn,
                total_deaths: totalDeaths,
                discoveries: [], // 발견 정보 제거
                discoveries_count: 0, // 발견 정보 제거
                cause_of_death: endingCondition.cause || null,
                ending_story: endingStory,
                completed_at: new Date().toISOString()
            };
            
            // 엔딩 API 호출
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
    
    // 엔딩 스토리 생성 (수정됨 - 발견 정보 제거, 누적 사망 횟수 사용)
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
    
    // 엔딩 화면 표시 (수정됨 - 발견 정보 제거)
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
                    <button id="view-endings" class="btn btn-secondary" style="margin: 5px;">엔딩 기록 보기</button>
                    <button id="back-to-main" class="btn btn-info" style="margin: 5px;">메인으로</button>
                </div>
            </div>
        `);
        
        // 엔딩 화면 버튼 이벤트
        $('#new-game-ending').click(function() {
            GameState.clearGameState();
            $('#chatbox').empty();
            $('#assistant-select').prop('disabled', false);
            handleNewGame();
        });
        
        $('#view-endings').click(function() {
            window.open('/endings', '_blank');
        });
        
        $('#back-to-main').click(function() {
            location.reload();
        });
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    async function handleNewGame() {
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
        
        loadGamesList(true);
        
        GameSocket.emit('new game', {
            assistant_id: $('#assistant-select').val(),
            thread_id: gameInfo.thread_id,
            game_id: gameInfo.game_id,
            game_data: gameInfo.game_data
        });
    }
    
    async function handleSaveGame() {
        const currentGameId = GameState.getCurrentGameId();
        const gameData = GameState.getGameData();
        
        if (!currentGameId || !gameData) {
            alert('저장할 게임이 없습니다.');
            return;
        }
        
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다.');
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
    
    function handleSaveGameSuccess(saveInfo) {
        hideLoading();
        setButtonLoading($('#save-game'), false);
        enableAllButtons();
        
        alert('게임이 저장되었습니다!');
        
        $('#chatbox').empty();
        
        if (saveInfo.initial_response) {
            $('#chatbox').append(`<div class="message assistant-message">${saveInfo.initial_response}</div>`);
            
            const buttons = createChoiceButtons(saveInfo.initial_response);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
        }
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
        loadGamesList(true);
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
    
    // 게임 목록 로드 (수정됨 - 사망 횟수 및 턴 정보 개선)
    async function loadGamesList(forceRefresh = false) {
        try {
            if (forceRefresh) {
                const savedGamesList = $('#saved_games_list');
                savedGamesList.empty();
                savedGamesList.append('<p>게임 목록 업데이트 중...</p>');
            }
            
            // 현재 사용자의 총 사망 횟수 가져오기
            const endingsResponse = await GameAPI.game.ending.list();
            let totalUserDeaths = 0;
            
            if (endingsResponse.code === "result") {
                totalUserDeaths = endingsResponse.value_ext2.endings.filter(
                    ending => ending.ending_type === 'death'
                ).length;
            }
            
            const response = await GameAPI.game.list();
            
            if (response.code === "result" && response.value >= 0) {
                handleGamesListSuccess(response.value_ext2.games, forceRefresh, totalUserDeaths);
            }
        } catch (error) {
            console.error('게임 목록 로드 오류:', error);
            $('#saved_games_list').html('<p>게임 목록을 불러오는 중 오류가 발생했습니다.</p>');
        }
    }
    
    // 게임 목록 성공 처리 (수정됨)
    function handleGamesListSuccess(games, forceRefresh = false, totalUserDeaths = 0) {
        const savedGamesList = $('#saved_games_list');
        savedGamesList.empty();

        if (games.length === 0) {
            savedGamesList.append('<p>저장된 게임이 없습니다.</p>');
            return;
        }

        games.forEach(function(game) {
            const gameDate = new Date(game.last_updated).toLocaleString();
            const gameData = game.game_data || {};
            const location = gameData.location || {};
            
            const currentLocation = location.current || "알 수 없음";
            const turnCount = gameData.turn_count || 1;
            const gameMode = gameData.game_mode || 'legacy';
            
            const isCurrentGame = (game.game_id === GameState.getCurrentGameId());
            const highlightClass = isCurrentGame ? 'current-game' : '';
            const modeIcon = gameMode === 'roguelike' ? '🎲' : '⚔️';
            
            savedGamesList.append(`
                <div class="game-entry ${highlightClass}" data-game-id="${game.game_id}">
                    <span><strong>${modeIcon} ${gameMode === 'roguelike' ? '로그라이크' : '레거시'}</strong></span>
                    <span><strong>저장:</strong> ${gameDate}</span>
                    <span class="location-info"><strong>위치:</strong> ${currentLocation}</span>
                    <span>🔢 ${turnCount}턴 💀 ${totalUserDeaths}회</span>
                    <div class="game-actions">
                        <button class="btn btn-primary" onclick="loadGame('${game.game_id}')">불러오기</button>
                        <button class="btn btn-danger" onclick="deleteGame('${game.game_id}')" style="margin-left: 5px;">삭제</button>
                    </div>
                </div>
            `);
        });
    }
    
    return {
        initialize: initialize,
        showLoading: showLoading,
        hideLoading: hideLoading,
        setButtonLoading: setButtonLoading,
        createChoiceButtons: createChoiceButtons,
        disableAllButtons: disableAllButtons,
        enableAllButtons: enableAllButtons,
        loadGamesList: loadGamesList,
        handleGameEnding: handleGameEnding,
        showEndingScreen: showEndingScreen
    };
})();
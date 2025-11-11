// public/javascripts/ui.js

const GameUI = (function() {
    let gameExists = false;
    let isImageGenerating = false;
    
    function initialize() {
        bindUIEvents();
        setupEventHandlers();
        checkGameState();
    }
    
    async function checkGameState() {
        try {
            const response = await GameAPI.game.loadCurrent();
            if (response.code === "result" && response.value === 1 && response.value_ext2.game) {
                gameExists = true;
                updateLoadButtonState(true);
            } else {
                gameExists = false;
                updateLoadButtonState(false);
            }
        } catch (error) {
            if (error.response && error.response.status === 404) {
                gameExists = false;
                updateLoadButtonState(false);
            } else {
                console.error('게임 상태 확인 오류:', error);
            }
        }
    }
    
    function updateLoadButtonState(hasGame) {
        const loadButton = $('#load-game');
        if (hasGame) {
            loadButton.prop('disabled', false).removeClass('btn-disabled');
        } else {
            loadButton.prop('disabled', true).addClass('btn-disabled');
        }
    }
    
    // ✅ 이미지 생성 상태 관리
    function setImageGenerating(generating) {
        isImageGenerating = generating;
        
        if (generating) {
            // 이미지 생성 중 - 모든 버튼 비활성화
            disableAllButtons();
            // 오른쪽 이미지 영역에 로딩 표시
            $('#image-display').html(`
                <div class="image-loading-container" style="text-align: center;">
                    <div class="spinner"></div>
                    <div style="margin-top: 20px; color: #6c757d;">이미지 생성 중...</div>
                </div>
            `);
        } else {
            // 이미지 생성 완료 - 버튼 활성화
            enableAllButtons();
        }
    }
    
    function showImageLoadingIndicator() {
        // 오른쪽 이미지 영역에 로딩 표시
        $('#image-display').html(`
            <div class="image-loading-container" style="text-align: center;">
                <div class="spinner"></div>
                <div style="margin-top: 20px; color: #6c757d;">이미지 생성 중...</div>
            </div>
        `);
    }
    
    function hideImageLoadingIndicator() {
        // 로딩 표시 제거는 이미지가 표시될 때 자동으로 처리됨
    }

    function bindUIEvents() {
        $('#new-game').click(handleNewGame);
        $('#load-game').click(handleLoadGame);
        $('#view-endings').click(handleViewEndings);
        $('#logout-button').on('click', handleLogout);
        $(document).on('keydown', handleKeyDown);
        $(document).on('click', '#restart-button', handleRestartGame);
        $(document).on('click', '#game-continue', handleGameContinue);
        
        // ✅ 텍스트 입력 이벤트 추가
        $('#send-btn').click(handleTextInput);
        $('#user-input').keypress(function(e) {
            if (e.which === 13) { // Enter 키
                handleTextInput();
            }
        });
    }
    
    function setupEventHandlers() {
        $(document).on('chat:response', handleChatResponse);
        $(document).on('game:new', handleSocketNewGame);
        $(document).on('game:load', handleSocketGameLoad);
        
        // ✅ 이미지 관련 이벤트 핸들러 추가
        $(document).on('image:generating', handleImageGenerating);
        $(document).on('image:ready', handleImageReady);
        $(document).on('image:error', handleImageError);
        $(document).on('image:skipped', handleImageSkipped);
    }
    
    // ✅ 이미지 이벤트 핸들러들
    function handleImageGenerating(event, data) {
        console.log('Image generation started:', data);
        setImageGenerating(true);
    }
    
    function handleImageReady(event, data) {
        console.log('Image generation completed:', data);
        setImageGenerating(false);
    }
    
    function handleImageError(event, data) {
        console.error('Image generation failed:', data);
        setImageGenerating(false);
        
        $('#chatbox').append(`
            <div class="system-message error">
                이미지 생성 중 오류가 발생했습니다: ${data.error || '알 수 없는 오류'}
            </div>
        `);
    }
    
    function handleImageSkipped(event, data) {
        console.log('Image generation skipped:', data);
        setImageGenerating(false);
    }
    
    // ✅ 텍스트 입력 핸들러
    function handleTextInput() {
        const userText = $('#user-input').val().trim();
        
        if (!userText) {
            alert('행동을 입력해주세요.');
            return;
        }
        
        if (GameState.isProcessingChoice() || isImageGenerating) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        const currentGameId = GameState.getCurrentGameId();
        if (!currentGameId) {
            alert('게임을 먼저 시작해주세요.');
            return;
        }
        
        GameState.setProcessingChoice(true);
        disableAllButtons();
        
        showLoading('선택을 처리하는 중...');
        
        // 입력란 초기화
        $('#user-input').val('');
        
        // 기존 sendMessage 재사용
        GameChat.sendMessage(userText);
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
                    <button id="game-continue" class="btn btn-primary mt-2">재연결 시도</button>
                </div>
            `);
        }
        
        const currentGameId = GameState.getCurrentGameId();
        if (!currentGameId) {
            return null;
        }
        
        const upMatch = message.match(/↑\s*([^\n]+)/);
        const downMatch = message.match(/↓\s*([^\n]+)/);
        const leftMatch = message.match(/←\s*([^\n]+)/);
        const rightMatch = message.match(/→\s*([^\n]+)/);
        
        if (!upMatch && !downMatch && !leftMatch && !rightMatch) {
            return null;
        }
        
        const choiceContainer = $('<div class="choice-buttons"></div>');
        
        if (upMatch) {
            choiceContainer.append(`<button class="choice-btn" data-choice="↑">${upMatch[0]}</button>`);
        }
        if (downMatch) {
            choiceContainer.append(`<button class="choice-btn" data-choice="↓">${downMatch[0]}</button>`);
        }
        if (leftMatch) {
            choiceContainer.append(`<button class="choice-btn" data-choice="←">${leftMatch[0]}</button>`);
        }
        if (rightMatch) {
            choiceContainer.append(`<button class="choice-btn" data-choice="→">${rightMatch[0]}</button>`);
        }
        
        choiceContainer.on('click', '.choice-btn', handleChoiceClick);
        
        return choiceContainer;
    }
    
    function handleChoiceClick(e) {
        if (GameState.isProcessingChoice() || isImageGenerating) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        const choice = $(e.target).data('choice');
        const clickedButton = $(e.target);
        
        GameState.setProcessingChoice(true);
        
        // 클릭한 버튼만 활성 상태로 유지, 나머지는 비활성화
        $('.choice-btn').each(function() {
            if (this === clickedButton[0]) {
                $(this).css('opacity', '1');
                $(this).prop('disabled', true);
            } else {
                $(this).css('opacity', '0.3');
                $(this).prop('disabled', true);
            }
        });
        
        // 다른 버튼들도 비활성화
        disableAllButtons();
        
        showLoading('선택을 처리하는 중...');
        
        // 유저 메시지 표시 제거 (하늘색 박스 안 보이게)
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
        
        GameChat.sendMessage(choice);
    }
    
    function disableAllButtons() {
        $('.choice-btn').prop('disabled', true);
        $('#new-game').prop('disabled', true);
        $('#load-game').prop('disabled', true);
        $('#view-endings').prop('disabled', true);
        $('#user-input').prop('disabled', true);  // ✅ 입력란 비활성화
        $('#send-btn').prop('disabled', true);     // ✅ 전송 버튼 비활성화
    }
    
    function enableAllButtons() {
        $('.choice-btn').prop('disabled', false);
        $('#new-game').prop('disabled', false);
        $('#user-input').prop('disabled', false);  // ✅ 입력란 활성화
        $('#send-btn').prop('disabled', false);     // ✅ 전송 버튼 활성화
        
        if (gameExists) {
            $('#load-game').prop('disabled', false);
        }
        
        $('#view-endings').prop('disabled', false);
    }
    
    function handleChatResponse(event, data) {
        hideLoading();
        GameState.setProcessingChoice(false);
        
        if (data.success) {
            // 선택지 부분 제거한 응답 텍스트
            let displayResponse = data.response;
            const choicePattern = /[↑↓←→]\s*[^\n]+/g;
            displayResponse = displayResponse.replace(choicePattern, '').trim();
            
            // 기존 메시지 모두 제거하고 마지막 응답만 표시
            $('#chatbox .message').remove();
            $('#chatbox .choice-buttons').remove();
            
            $('#chatbox').append(`<div class="message assistant-message">${displayResponse}</div>`);
            
            // 버튼은 원본 응답에서 파싱
            const buttons = createChoiceButtons(data.response);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
            
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
            if (data.game_state) {
                GameState.updateGameStateFromParsing(data.game_state);
            }
            
            const endingCondition = GameState.checkEndingConditions(data.response);
            if (endingCondition) {
                handleGameEnding(endingCondition, data.response);
            }
        } else {
            enableAllButtons();
            $('#chatbox').append(`
                <div class="message error">
                    오류: ${data.error}
                    <button id="restart-button" class="btn btn-primary mt-2">새 게임 시작</button>
                </div>
            `);
        }
    }
    
    function handleKeyDown(e) {
        if (GameState.isProcessingChoice() || isImageGenerating) {
            return;
        }
        
        const keyMap = {
            'ArrowUp': '↑',
            'ArrowDown': '↓',
            'ArrowLeft': '←',
            'ArrowRight': '→'
        };
        
        const choice = keyMap[e.key];
        if (choice) {
            const button = $(`.choice-btn[data-choice="${choice}"]:not(:disabled)`);
            if (button.length > 0) {
                e.preventDefault();
                button.click();
            }
        }
    }
    
    function handleLogout(e) {
        if (confirm('정말 로그아웃 하시겠습니까?')) {
            return true;
        }
        e.preventDefault();
        return false;
    }
    
    function handleViewEndings() {
        window.open('/endings', '_blank');
    }
    
    function handleRestartGame() {
        location.reload();
    }
    
    function handleGameContinue() {
        location.reload();
    }
    
    async function handleNewGame() {
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 다시 시도해주세요.');
            return;
        }
        
        const currentGameId = GameState.getCurrentGameId();
        if (currentGameId) {
            if (!confirm('현재 진행 중인 게임이 있습니다. 새 게임을 시작하시겠습니까?')) {
                return;
            }
        }
        
        const assistantId = $('#assistant-select').val();
        if (!assistantId) {
            alert('어시스턴트를 선택해주세요.');
            return;
        }
        
        disableAllButtons();
        setButtonLoading($('#new-game'), true);
        showLoading('새 게임을 생성하는 중...');
        GameChat.clearImageDisplay(); // 이미지 영역 초기화
        
        try {
            const response = await GameAPI.game.create(assistantId);
            
            if (response.code === "result" && response.value === 1) {
                const gameInfo = response.value_ext2;
                gameExists = true;
                updateLoadButtonState(true);
                handleNewGameSuccess(gameInfo);
            } else {
                throw new Error(response.value_ext2 || '게임 생성 실패');
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
        GameChat.clearImageDisplay(); // 이미지 영역 초기화
        
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
                alert('게임 불러오기 중 오류: ' + (error.message || error));
            }
            enableAllButtons();
        }
    }
    
    function handleLoadGameSuccess(gameData) {
        hideLoading();
        setButtonLoading($('#load-game'), false);
        
        GameState.setGameState(gameData.game_id, gameData.game_data);
        
        $('#chatbox').empty();
        $('#assistant-select').val(gameData.assistant_id);
        $('#assistant-select').prop('disabled', true);
        
        GameSocket.emit('load game', {
            game_id: gameData.game_id
        });
        
        enableAllButtons();
    }
    
    async function handleGameEnding(endingCondition, aiResponse) {
        showLoading('엔딩을 처리하는 중...');
        
        try {
            const currentGameId = GameState.getCurrentGameId();
            const gameData = GameState.getGameData();
            
            // 사망 횟수는 서버에서 자동 계산되므로 클라이언트에서는 0으로 설정
            let totalDeaths = 0;
            
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
                gameExists = false;
                updateLoadButtonState(false);
                // GameChat.clearImageDisplay() 제거 - 로딩 유지를 위해
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
            
            if (totalDeaths <= 1) {
                story += "최소한의 희생으로 탈출에 성공했습니다.";
            } else if (totalDeaths <= 5) {
                story += "몇 번의 시행착오 끝에 탈출에 성공했습니다.";
            } else {
                story += "수많은 죽음을 극복하고 마침내 탈출에 성공했습니다.";
            }
        }
        
        return story;
    }
    
    function showEndingScreen(endingData, aiResponse) {
        $('#chatbox').empty();
        
        const endingClass = endingData.ending_type === 'escape' ? 'success' : 'danger';
        const endingTitle = endingData.ending_type === 'escape' ? '🎉 탈출 성공!' : '💀 게임 오버';
        
        $('#chatbox').append(`
            <div class="ending-screen" style="padding: 30px; text-align: center;">
                <h2 style="color: ${endingData.ending_type === 'escape' ? '#28a745' : '#dc3545'}; margin-bottom: 20px;">
                    ${endingTitle}
                </h2>
                
                <div class="ending-stats" style="margin: 20px 0;">
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
        
        $('#new-game-ending').click(function() {
            GameState.clearGameState();
            $('#chatbox').empty();
            $('#assistant-select').prop('disabled', false);
            gameExists = false;
            updateLoadButtonState(false);
            GameChat.clearImageDisplay(); // 이미지 영역 초기화
            handleNewGame();
        });
        
        $('#view-endings-ending').click(function() {
            GameState.clearGameState();
            gameExists = false;
            updateLoadButtonState(false);
            window.open('/endings', '_blank');
        });
        
        $('#back-to-main').click(function() {
            GameState.clearGameState();
            gameExists = false;
            updateLoadButtonState(false);
            GameChat.clearImageDisplay(); // 이미지 영역 초기화
            location.reload();
        });
        
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    function handleSocketNewGame(event, data) {
        setButtonLoading($('#new-game'), false);
        
        if (data.success) {
            hideLoading();
            $('#connection-error').remove();
            
            GameState.setGameState(data.game_id, data.game_data);
            
            $('.system-message').remove();
            
            if (data.initial_message) {
                // 선택지 부분 제거한 응답 텍스트
                let displayResponse = data.initial_message;
                const choicePattern = /[↑↓←→]\s*[^\n]+/g;
                displayResponse = displayResponse.replace(choicePattern, '').trim();
                
                // 기존 메시지 모두 제거하고 마지막 응답만 표시
                $('#chatbox .message').remove();
                $('#chatbox .choice-buttons').remove();
                
                $('#chatbox').append(`<div class="message assistant-message">${displayResponse}</div>`);
                
                // 버튼은 원본 응답에서 파싱
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
                    const lastAIMessage = filteredHistory[0];
                    
                    // 선택지 부분 제거한 응답 텍스트
                    let displayResponse = lastAIMessage.content;
                    const choicePattern = /[↑↓←→]\s*[^\n]+/g;
                    displayResponse = displayResponse.replace(choicePattern, '').trim();
                    
                    $('#chatbox').append(`<div class="message assistant-message">${displayResponse}</div>`);
                    
                    // 버튼은 원본 응답에서 파싱
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
        showEndingScreen: showEndingScreen,
        checkGameState: checkGameState,
        updateLoadButtonState: updateLoadButtonState,
        setImageGenerating: setImageGenerating // ✅ 외부에서 사용할 수 있도록 export
    };
})();

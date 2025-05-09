// public/js/game/ui.js
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
        
        // 게임 목록 이벤트
        $(document).on('games:list', handleGamesList);
        
        // 새 게임 이벤트
        $(document).on('game:new', handleGameNew);
        
        // 게임 로드 이벤트
        $(document).on('game:load', handleGameLoad);
        
        // 게임 저장 진행 이벤트
        $(document).on('game:saveProgress', handleGameSaveProgress);
        
        // 게임 저장 완료 이벤트
        $(document).on('game:save', handleGameSave);
        
        // 게임 삭제 이벤트
        $(document).on('game:delete', handleGameDelete);
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
        // 이전 선택지 버튼 제거
        $('.choice-buttons').remove();
        
        // 연결 상태 확인
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
        
        // 선택지 패턴 매칭
        const choicePattern = /(?:^|\n)(\d+)[\.\)]\s*([^\n\.]+?)(?=$|\n|\.)/g;
        let choices = [];
        let match;
        
        console.log('선택지 검색 시작:', message);
        
        // 모든 선택지 찾기
        while ((match = choicePattern.exec(message)) !== null) {
            // 선택지 번호가 1-4 사이여야 함
            if (['1', '2', '3', '4'].includes(match[1])) {
                const number = match[1].trim();
                const text = match[2].trim();
                
                console.log(`선택지 발견: ${number}. ${text}`);
                
                choices.push({
                    number: number,
                    text: text
                });
            }
        }
        
        console.log('찾은 선택지:', choices.length, choices);
        
        // 최소 1개 이상의 선택지가 있는지 확인
        if (choices.length === 0) {
            console.warn('유효한 선택지를 찾을 수 없습니다:', message);
            
            // 선택지가 없을 경우 게임 진행 불가 알림
            const errorMessage = $(`
                <div class="system-message error">
                    선택지를 찾을 수 없습니다. 게임을 다시 시작해주세요.
                    <button id="restart-button" class="btn btn-primary mt-2">게임 다시 시작</button>
                    <button id="game-continue" class="btn btn-warning mt-2">계속 진행 시도</button>
                </div>
            `);
            
            return errorMessage;
        }
        
        // 선택지 버튼 생성
        const buttonContainer = $('<div class="choice-buttons"></div>');
        choices.forEach((choice, index) => {
            // 방향키 아이콘 추가
            const directionIcons = ['↑', '↓', '←', '→'];
            const directionIcon = index < 4 ? directionIcons[index] : '';
            
            const button = $(`
                <button class="choice-button" data-choice="${choice.number}">
                    <span class="direction-icon">${directionIcon}</span> ${choice.number}. ${choice.text}
                </button>
            `);
            
            buttonContainer.append(button);
        });
        
        // 모든 버튼에 클릭 이벤트 바인딩
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
        
        // 이미 처리 중인 선택이 있으면 무시
        if (GameState.isProcessingChoice()) {
            console.log('이미 선택지 처리 중입니다. 중복 선택 무시');
            return;
        }

        // 모든 버튼 비활성화 추가
        disableAllButtons();1
        
        // 현재 선택 버튼과 텍스트
        const selectedButton = $(this);
        const choiceNumber = selectedButton.data('choice');
        const choiceText = selectedButton.text().trim();
        
        // 처리 중인 선택지 표시
        selectedButton.addClass('processing');
        
        // 선택 처리 상태 설정
        GameState.setProcessingChoice(true);
        
        // 선택 메시지 채팅창에 추가
        $('#chatbox').append(`<div class="message user-message">${choiceText}</div>`);
        
        // 서버에 메시지 전송
        GameSocket.emit('chat message', {
            message: choiceNumber,
            game_id: currentGameId
        });
        
        // 응답 대기 메시지 추가
        $('#chatbox').append(`<div id="waiting-response" class="system-message">서버 응답 대기 중...</div>`);
        
        // 채팅창 스크롤
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    // 버튼 하이라이트 효과
    function highlightButton(index) {
        // 모든 버튼 하이라이트 제거
        $('.choice-button').removeClass('highlight-button');
        // 선택된 버튼 하이라이트
        $('.choice-button').eq(index).addClass('highlight-button');
        
        // 짧은 시간 후 하이라이트 제거
        setTimeout(function() {
            $('.choice-button').removeClass('highlight-button');
        }, 300);
    }
    
    // 방향키 이벤트 처리
    function handleKeyDown(e) {
        // 선택지 처리 중이거나 선택지가 없는 경우 무시
        if (GameState.isProcessingChoice() || $('.choice-button').length === 0) {
            return;
        }
        
        // 활성화된 버튼만 선택 가능
        const enabledButtons = $('.choice-button:not(:disabled)');
        if (enabledButtons.length === 0) return;
        
        switch(e.key) {
            case 'ArrowUp':    // 위쪽 방향키
                highlightButton(0);
                setTimeout(function() {
                    enabledButtons.eq(0).trigger('click');
                }, 100);
                break;
            case 'ArrowDown':  // 아래쪽 방향키
                highlightButton(1);
                setTimeout(function() {
                    enabledButtons.eq(1).trigger('click');
                }, 100);
                break;
            case 'ArrowLeft':  // 왼쪽 방향키
                highlightButton(2);
                setTimeout(function() {
                    enabledButtons.eq(2).trigger('click');
                }, 100);
                break;
            case 'ArrowRight': // 오른쪽 방향키
                highlightButton(3);
                setTimeout(function() {
                    enabledButtons.eq(3).trigger('click');
                }, 100);
                break;
        }
    }
    
    // 새 게임 처리
    function handleNewGame() {
        if (GameState.getCurrentGameId() && !confirm('새 게임을 시작하시겠습니까?')) return;
        
        if (!GameSocket.isConnected()) {
            alert('서버에 연결되어 있지 않습니다. 재연결 후 다시 시도해주세요.');
            return;
        }
        
        // 버튼 로딩 상태 설정
        setButtonLoading($(this), true);
        
        // 로딩 오버레이 표시
        showLoading('새 게임을 시작하는 중...');
        
        GameSocket.emit('new game', {
            assistant_id: $('#assistant-select').val()
        });
    }
    
    // 게임 저장 처리
    function handleSaveGame() {
        const currentGameId = GameState.getCurrentGameId();
        const gameData = GameState.getGameData();
        
        if (!currentGameId || !gameData) {
            alert('저장할 게임이 없습니다.');
            return;
        }
        
        // 선택지 처리 중인 경우 저장 불가
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 저장해주세요.');
            return;
        }
        
        try {
            // 버튼 로딩 상태 설정
            setButtonLoading($(this), true);
            
            // 로딩 오버레이 표시
            showLoading('게임을 저장하는 중...');
            
            // 게임 데이터 로깅
            console.log('저장 요청 - gameData 타입:', typeof gameData);
            console.log('저장 요청 - gameData:', gameData);
            
            // 유효한 객체인지 확인
            if (gameData === null || gameData === undefined) {
                throw new Error('게임 데이터가 없습니다');
            }
            
            // 깊은 복사로 데이터 전송 - JSON 직렬화 이슈 방지
            const gameCopy = JSON.parse(JSON.stringify(gameData));
            
            // 서버로 전송
            GameSocket.emit('save game', {
                game_id: currentGameId,
                game_data: gameCopy
            });
        } catch (err) {
            // 오류 처리
            console.error('게임 저장 처리 중 오류:', err);
            
            // 버튼 로딩 상태 해제
            setButtonLoading($('#save-game'), false);
            
            // 로딩 숨기기
            hideLoading();
            
            alert('게임 데이터 처리 중 오류가 발생했습니다: ' + err.message);
        }
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
        
        $('#assistant-select').prop('disabled', false);
        $('#chatbox').empty();
        
        GameState.clearGameState();
        
        // 선택지 버튼 제거
        $('.choice-buttons').remove();
        
        // 시스템 메시지 표시
        $('#chatbox').append(`
            <div class="system-message">
                게임이 초기화되었습니다. '새 게임' 버튼을 눌러 게임을 시작하세요.
            </div>
        `);
    }
    
    // 게임 계속 진행 처리
    function handleGameContinue() {
        // 기본 선택지 제공
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
        
        // 모든 버튼에 클릭 이벤트 바인딩
        buttonContainer.on('click', '.choice-button', handleChoiceSelection);
        
        // 오류 메시지 제거 후 기본 선택지 추가
        $(this).closest('.system-message').replaceWith(buttonContainer);
    }
    
    // 채팅 응답 처리
    function handleChatResponse(event, data) {
        // 대기 메시지 제거
        $('#waiting-response').remove();
        
        // 선택지 처리 상태 해제
        GameState.setProcessingChoice(false);
        
        enableAllButtons();

        if (data.success) {
            // 로딩 숨기기
            hideLoading();
            
            // 오류 메시지 제거 (있는 경우)
            $('#connection-error').remove();
            
            // 응답 메시지 표시
            $('#chatbox').append(`<div class="message assistant-message">${data.response}</div>`);
            
            // 응답 로깅
            console.log('AI 응답:', data.response);
            
            try {
                // 선택지 버튼 생성 및 추가
                const buttons = createChoiceButtons(data.response);
                if (buttons) {
                    $('#chatbox').append(buttons);
                }
                
                // 서버로부터 받은 게임 상태 업데이트
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
            // 로딩 숨기기
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
    
    // 게임 목록 처리
    function handleGamesList(event, data) {
        if (data.success) {
            const savedGamesList = $('#saved_games_list');
            savedGamesList.empty();

            if (data.games.length === 0) {
                savedGamesList.append('<p>저장된 게임이 없습니다.</p>');
                return;
            }

            // 불러온 게임 목록 로깅
            console.log('불러온 전체 게임 목록:', data.games);

            data.games.forEach(function(game) {
                // 마지막 저장 시간 포맷팅
                const gameDate = new Date(game.last_updated).toLocaleString();
                
                // 위치 정보 추출 (없으면 기본값)
                const currentLocation = (game.game_data && game.game_data.location && game.game_data.location.current) 
                    ? game.game_data.location.current 
                    : "알 수 없음";
                
                // 현재 게임 여부에 따른 강조 표시
                const isCurrentGame = (game.game_id === GameState.getCurrentGameId());
                const highlightClass = isCurrentGame ? 'current-game' : '';
                
                // 위치 정보를 강조한 게임 항목 생성
                savedGamesList.append(`
                    <div class="game-entry ${highlightClass}" data-game-id="${game.game_id}">
                        <span><strong>마지막 저장:</strong> ${gameDate}</span>
                        <span class="location-info"><strong>위치:</strong> ${currentLocation}</span>
                        <div class="game-actions">
                            <button class="btn btn-primary" onclick="loadGame('${game.game_id}')">불러오기</button>
                            <button class="btn btn-danger" onclick="deleteGame('${game.game_id}')" style="margin-left: 5px;">삭제</button>
                        </div>
                    </div>
                `);
            });
            
            // 현재 선택된 게임으로 스크롤
            if (GameState.getCurrentGameId()) {
                const currentGameElement = $(`.game-entry[data-game-id="${GameState.getCurrentGameId()}"]`);
                if (currentGameElement.length) {
                    $('#game-load-list').scrollTop(currentGameElement.position().top);
                }
            }
        } else {
            alert('게임 목록을 불러오는 중 오류가 발생했습니다: ' + data.error);
        }
    }
    
    // 새 게임 응답 처리
    function handleGameNew(event, data) {
        // 새 게임 버튼 로딩 상태 해제
        setButtonLoading($('#new-game'), false);
        
        if (data.success) {
            // 로딩 숨기기
            hideLoading();
            
            $('#connection-error').remove(); // 오류 메시지 제거 (있는 경우)
            
            // 게임 상태 설정
            GameState.setGameState(data.game_id, data.game_data);
            
            // 채팅창 초기화
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
            
            // 게임 목록 업데이트 체크
            setTimeout(() => {
                if (!$('#saved_games_list').children().length) {
                    GameSocket.loadGamesList();
                }
            }, 1000);
        } else {
            // 로딩 숨기기
            hideLoading();
            
            alert(data.error || '게임 시작 중 오류가 발생했습니다.');
        }
    }
    
    // 게임 로드 응답 처리
    function handleGameLoad(event, data) {
        // 로딩 숨기기
        hideLoading();
        
        if (data.success) {
            // 게임 상태 설정
            GameState.setGameState(data.game.game_id, data.game.game_data);
            
            // 채팅창 초기화
            $('#chatbox').empty();
            
            if (data.game.chatHistory && data.game.chatHistory.length > 0) {
                // 채팅 히스토리 표시 (시간순으로 정렬)
                const chatHistory = [...data.game.chatHistory].sort((a, b) => {
                    const dateA = new Date(a.created_at);
                    const dateB = new Date(b.created_at);
                    return dateA - dateB;
                });
                
                // 대화 내용 표시
                chatHistory.forEach(msg => {
                    const messageClass = msg.role === 'user' ? 'user-message' : 'assistant-message';
                    $('#chatbox').append(`<div class="message ${messageClass}">${msg.content}</div>`);
                });
                
                // 마지막 메시지가 AI 응답인지 확인하고 선택지 버튼 생성
                const lastMessage = chatHistory[chatHistory.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                    console.log('Creating choice buttons for last AI message');
                    const buttons = createChoiceButtons(lastMessage.content);
                    if (buttons) {
                        $('#chatbox').append(buttons);
                    } else {
                        console.warn('Failed to create choice buttons');
                    }
                }
            }
            
            $('#assistant-select').prop('disabled', true);
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
        } else {
            $('#chatbox').empty().append(`<div class="message error">게임을 불러오는 중 오류: ${data.error}</div>`);
        }
    }
    
    // 게임 저장 진행 상태 처리
    function handleGameSaveProgress(event, data) {
        if (data.status === 'saving') {
            // 저장 중 표시
            $('#chatbox').append(`<div class="message system-message">${data.message}</div>`);
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
        }
    }
    
    // 게임 저장 응답 처리
    function handleGameSave(event, data) {
        // 저장 버튼 상태 복원
        setButtonLoading($('#save-game'), false);
        
        // 로딩 숨기기
        hideLoading();
        
        if (data.success) {
            // 성공 메시지 표시
            alert('게임이 저장되었습니다!');
            
            // 이전 메시지 및 버튼 제거
            $('#chatbox').empty();
            
            // 요약 정보에서 위치 정보 추출
            let locationFromSummary = GameState.extractLocationFromSummary(data.summary);
            console.log('요약에서 추출한 위치 정보:', locationFromSummary);
            
            // 현재 게임 데이터 업데이트
            if (locationFromSummary) {
                GameState.updateGameLocation(locationFromSummary);
            }
            
            // 요약 응답 표시 (사용자 메시지로)
            $('#chatbox').append(`<div class="message user-message">이전 게임 요약: ${data.summary}</div>`);
            
            // 새 스레드의 응답 표시
            $('#chatbox').append(`<div class="message assistant-message">${data.initialResponse}</div>`);
            
            // 선택지 버튼 생성
            const buttons = createChoiceButtons(data.initialResponse);
            if (buttons) {
                $('#chatbox').append(buttons);
            }
            
            // 스크롤 조정
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
            // 게임 목록 강제 갱신
            console.log('게임 목록 강제 갱신 요청');
            GameSocket.loadGamesList(true);
        } else {
            alert('게임 저장 중 오류: ' + data.error);
        }
    }
    
    // 게임 삭제 응답 처리
    function handleGameDelete(event, data) {
        if (data.success) {
            if (GameState.getCurrentGameId() === data.game_id) {
                // 현재 게임이 삭제된 경우, 상태 초기화
                GameState.clearGameState();
                
                // UI 초기화
                $('#chatbox').empty();
                $('#assistant-select').prop('disabled', false);
            }
            
            alert('게임이 삭제되었습니다.');
            GameSocket.loadGamesList();
        } else {
            alert('게임 삭제 중 오류: ' + data.error);
        }
    }
    
    // 공개 API
    return {
        initialize: initialize,
        showLoading: showLoading,
        hideLoading: hideLoading,
        setButtonLoading: setButtonLoading,
        createChoiceButtons: createChoiceButtons
    };
})();
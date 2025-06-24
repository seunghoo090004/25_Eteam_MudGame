// public/javascripts/ui.js - gameId 검증 및 데이터 속성 강화

const GameUI = (function() {
    // 전역 변수
    let currentGameId = null;
    let gameData = null;
    
    // UI 초기화
    function initialize() {
        bindUIEvents();
        setupEventHandlers();
        
        // 초기 상태 로깅
        console.log('GameUI 초기화 완료');
    }
    
    // currentGameId getter/setter 추가
    function getCurrentGameId() {
        return currentGameId;
    }
    
    function setCurrentGameId(gameId) {
        console.log('currentGameId 변경:', currentGameId, '->', gameId);
        currentGameId = gameId;
    }
    
    function clearCurrentGameId() {
        console.log('currentGameId 초기화:', currentGameId, '-> null');
        currentGameId = null;
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
        
        // 선택지 버튼 클릭 이벤트 (동적 생성)
        $(document).on('click', '.choice-button', handleChoiceSelection);
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
    
    // gameId 검증 함수 추가
    function validateGameId(gameId, functionName = '') {
        console.log(`${functionName} - gameId 검증:`, gameId, typeof gameId);
        
        if (!gameId || gameId === 'undefined' || gameId === 'null') {
            console.error(`${functionName} - 유효하지 않은 gameId:`, gameId);
            return false;
        }
        
        if (typeof gameId !== 'string' || gameId.length < 10) {
            console.error(`${functionName} - gameId 형식 오류:`, gameId);
            return false;
        }
        
        return true;
    }
    
    // 전역 함수: 게임 불러오기
    window.loadGame = function(gameId) {
        console.log('loadGame 호출됨 - gameId:', gameId, typeof gameId);
        
        // gameId 검증
        if (!validateGameId(gameId, 'loadGame')) {
            alert('유효하지 않은 게임 ID입니다.');
            return;
        }
        
        // 연결 상태 확인
        if (!GameSocket.isConnected()) {
            alert('서버에 연결되지 않았습니다. 페이지를 새로고침해 주세요.');
            return;
        }
        
        try {
            // 모든 버튼 비활성화
            disableAllButtons();
            
            // 로딩 표시
            showLoading('게임을 불러오는 중...');
            
            // currentGameId 설정
            setCurrentGameId(gameId);
            
            // 서버에 게임 로드 요청
            GameSocket.emit('load game', {
                game_id: gameId
            });
            
            console.log('게임 로드 요청 전송:', gameId);
            
        } catch (error) {
            console.error('게임 로드 요청 중 오류:', error);
            
            // 로딩 숨기기
            hideLoading();
            
            // 버튼 다시 활성화
            enableAllButtons();
            
            alert('게임 로드 요청 중 오류가 발생했습니다: ' + error.message);
        }
    };
    
    // 전역 함수: 게임 삭제
    window.deleteGame = function(gameId) {
        console.log('deleteGame 호출됨 - gameId:', gameId, typeof gameId);
        
        // gameId 검증
        if (!validateGameId(gameId, 'deleteGame')) {
            alert('유효하지 않은 게임 ID입니다.');
            return;
        }
        
        if (!confirm('정말로 이 게임을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return;
        }
        
        // 연결 상태 확인
        if (!GameSocket.isConnected()) {
            alert('서버에 연결되지 않았습니다. 페이지를 새로고침해 주세요.');
            return;
        }
        
        try {
            // 모든 버튼 비활성화
            disableAllButtons();
            
            // 로딩 표시
            showLoading('게임을 삭제하는 중...');
            
            // 서버에 게임 삭제 요청
            GameSocket.emit('delete game', {
                game_id: gameId
            });
            
            console.log('게임 삭제 요청 전송:', gameId);
            
        } catch (error) {
            console.error('게임 삭제 요청 중 오류:', error);
            
            // 로딩 숨기기
            hideLoading();
            
            // 버튼 다시 활성화
            enableAllButtons();
            
            alert('게임 삭제 요청 중 오류가 발생했습니다: ' + error.message);
        }
    };
    
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
                    <button id="manual-reconnect" class="btn btn-primary mt-2">다시 연결</button>
                </div>
            `);
            
            return errorMessage;
        }
        
        // 선택지 추출 (1., 2., 3., 4. 형식)
        const choicePattern = /(\d+)\.\s*([^\n\r]+)/g;
        const choices = [];
        let match;
        
        while ((match = choicePattern.exec(message)) !== null) {
            choices.push({
                number: match[1],
                text: match[2].trim()
            });
        }
        
        // 선택지가 없으면 null 반환
        if (choices.length === 0) {
            console.log('선택지를 찾을 수 없습니다.');
            return null;
        }
        
        console.log('추출된 선택지:', choices);
        
        // 선택지 버튼 생성
        const buttonContainer = $('<div class="choice-buttons"></div>');
        
        choices.forEach((choice, index) => {
            const directionIcons = ['↑', '↓', '←', '→'];
            const directionIcon = directionIcons[index] || '•';
            
            const button = $(`
                <button class="choice-button" data-choice="${choice.number}">
                    <span class="direction-icon">${directionIcon}</span> ${choice.number}. ${choice.text}
                </button>
            `);
            
            buttonContainer.append(button);
        });
        
        return buttonContainer;
    }
    
    // 선택지 버튼 클릭 처리
    function handleChoiceSelection() {
        // 연결 상태 확인
        if (!GameSocket.isConnected()) {
            alert('서버 연결이 끊어졌습니다. 페이지를 새로고침해 주세요.');
            return;
        }
        
        // currentGameId 확인
        if (!currentGameId || !validateGameId(currentGameId, 'handleChoiceSelection')) {
            alert('게임 ID가 설정되지 않았습니다. 게임을 다시 시작해 주세요.');
            return;
        }
        
        // 이미 처리 중인 선택이 있으면 무시
        if (GameState.isProcessingChoice()) {
            console.log('이미 선택지 처리 중입니다. 중복 선택 무시');
            return;
        }

        // 모든 버튼 비활성화
        disableAllButtons();
        
        // 현재 선택 버튼과 텍스트
        const selectedButton = $(this);
        const choiceNumber = selectedButton.data('choice');
        const choiceText = selectedButton.text().trim();
        
        console.log('선택지 클릭:', choiceNumber, choiceText);
        
        // 처리 중인 선택지 표시
        selectedButton.addClass('processing');
        
        // 선택 처리 상태 설정
        GameState.setProcessingChoice(true);
        
        // **이전 메시지들 제거 - 최신 내용만 유지**
        $('#chatbox .message').remove();
        $('.choice-buttons').remove();
        $('.system-message').remove();
        
        // 선택 메시지 채팅창에 추가
        $('#chatbox').append(`<div class="message user-message">${choiceText}</div>`);
        
        // 서버에 메시지 전송
        GameSocket.emit('chat message', {
            message: choiceNumber,
            game_id: currentGameId
        });
        
        console.log('선택지 전송:', {
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
        
        let selectedIndex = -1;
        
        switch(e.key) {
            case 'ArrowUp':    // 위쪽 방향키
            case '1':
                selectedIndex = 0;
                break;
            case 'ArrowDown':  // 아래쪽 방향키
            case '2':
                selectedIndex = 1;
                break;
            case 'ArrowLeft':  // 왼쪽 방향키
            case '3':
                selectedIndex = 2;
                break;
            case 'ArrowRight': // 오른쪽 방향키
            case '4':
                selectedIndex = 3;
                break;
        }
        
        // 유효한 인덱스인 경우 버튼 클릭
        if (selectedIndex >= 0 && selectedIndex < enabledButtons.length) {
            e.preventDefault();
            highlightButton(selectedIndex);
            enabledButtons.eq(selectedIndex).click();
        }
    }
    
    // 새 게임 처리
    function handleNewGame() {
        // 연결 상태 확인
        if (!GameSocket.isConnected()) {
            alert('서버에 연결되지 않았습니다. 페이지를 새로고침해 주세요.');
            return;
        }
        
        try {
            // 모든 버튼 비활성화
            disableAllButtons();
            
            // 버튼 로딩 상태 설정
            setButtonLoading($(this), true);
            
            // 로딩 오버레이 표시
            showLoading('새 게임을 시작하는 중...');
            
            // 어시스턴트 선택
            const selectedAssistant = $('#assistant-select').val();
            
            // 이전 게임 상태 초기화
            clearCurrentGameId();
            gameData = null;
            GameState.clearGameState();
            
            // 채팅창 초기화
            $('#chatbox').empty();
            
            // 서버에 새 게임 요청
            GameSocket.emit('new game', {
                assistant_id: selectedAssistant
            });
            
            console.log('새 게임 요청 전송:', selectedAssistant);
            
        } catch (error) {
            console.error('새 게임 시작 중 오류:', error);
            
            // 버튼 로딩 상태 해제
            setButtonLoading($('#new-game'), false);
            
            // 로딩 숨기기
            hideLoading();
            
            // 버튼 다시 활성화
            enableAllButtons();
            
            alert('새 게임 시작 중 오류가 발생했습니다: ' + error.message);
        }
    }
    
    // 게임 저장 처리
    function handleSaveGame() {
        // 연결 상태 확인
        if (!GameSocket.isConnected()) {
            alert('서버에 연결되지 않았습니다. 페이지를 새로고침해 주세요.');
            return;
        }
        
        // currentGameId 확인
        if (!currentGameId || !validateGameId(currentGameId, 'handleSaveGame')) {
            alert('저장할 게임이 없습니다. 게임을 먼저 시작해 주세요.');
            return;
        }
        
        // 선택지 처리 중인 경우 저장 불가
        if (GameState.isProcessingChoice()) {
            alert('현재 선택지를 처리하는 중입니다. 응답을 받은 후 저장해주세요.');
            return;
        }
        
        try {
            // 모든 버튼 비활성화
            disableAllButtons();
            
            // 버튼 로딩 상태 설정
            setButtonLoading($(this), true);
            
            // 로딩 오버레이 표시
            showLoading('게임을 저장하는 중...');
            
            // 게임 데이터 검증
            const currentGameData = GameState.getGameData();
            console.log('저장 요청 - gameData 타입:', typeof currentGameData);
            console.log('저장 요청 - gameData:', currentGameData);
            
            // 유효한 객체인지 확인
            if (!currentGameData || currentGameData === null || currentGameData === undefined) {
                throw new Error('게임 데이터가 없습니다');
            }
            
            // 깊은 복사로 데이터 전송
            const gameCopy = JSON.parse(JSON.stringify(currentGameData));
            
            // 서버로 전송
            GameSocket.emit('save game', {
                game_id: currentGameId,
                game_data: gameCopy
            });
            
            console.log('게임 저장 요청 전송:', {
                game_id: currentGameId,
                game_data_type: typeof gameCopy
            });
            
        } catch (err) {
            // 오류 처리
            console.error('게임 저장 처리 중 오류:', err);
            
            // 버튼 로딩 상태 해제
            setButtonLoading($('#save-game'), false);
            
            // 로딩 숨기기
            hideLoading();
            
            // 버튼 다시 활성화
            enableAllButtons();
            
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
        
        // 모든 버튼 비활성화 후 곧바로 다시 활성화
        disableAllButtons();
        setTimeout(enableAllButtons, 100);
        
        $('#assistant-select').prop('disabled', false);
        $('#chatbox').empty();
        
        // 게임 상태 초기화
        clearCurrentGameId();
        gameData = null;
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
        // 모든 버튼 비활성화
        disableAllButtons();
        
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
        
        // 오류 메시지 제거 후 기본 선택지 추가
        $(this).closest('.system-message').replaceWith(buttonContainer);
        
        // 일정 시간 후 버튼 활성화
        setTimeout(enableAllButtons, 100);
    }
    
    // 채팅 응답 처리
    function handleChatResponse(event, data) {
        // 대기 메시지 제거
        $('#waiting-response').remove();
        
        // 선택지 처리 상태 해제
        GameState.setProcessingChoice(false);
        
        // 모든 버튼 다시 활성화
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
                    gameData = data.game_state;
                    GameState.setGameState(currentGameId, data.game_state);
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
    
    // 게임 목록 처리 - 🔧 핵심 수정 부분
    function handleGamesList(event, data) {
        console.log('게임 목록 처리 시작:', data);
        
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
                // 🔧 핵심 수정: game_id 검증
                const gameId = game.game_id || game.id;
                if (!validateGameId(gameId, 'handleGamesList')) {
                    console.error('게임 목록의 잘못된 gameId:', game);
                    return; // 이 게임 항목 건너뛰기
                }
                
                console.log('게임 항목 처리:', {
                    game_id: gameId,
                    last_updated: game.last_updated || game.dt8
                });
                
                // 마지막 저장 시간 포맷팅
                const lastUpdated = game.last_updated || game.dt8;
                const gameDate = new Date(lastUpdated).toLocaleString();
                
                // 게임 정보 추출
                const gameData = game.game_data || {};
                const player = gameData.player || {};
                const location = gameData.location || {};
                const inventory = gameData.inventory || {};
                const progress = gameData.progress || {};
                
                // 상태 정보 생성
                const currentLocation = location.current || "알 수 없음";
                const health = player.health || 100;
                const maxHealth = player.maxHealth || 100;
                const status = player.status || '양호';
                const mental = player.mental || '안정';
                const keyItems = inventory.keyItems || '없음';
                const playTime = progress.playTime || "방금 시작";
                const deathCount = progress.deathCount || 0;
                
                // 상태 아이콘 생성
                let statusIcon = '✅';
                if (health <= 20) statusIcon = '🔥';
                else if (health <= 50) statusIcon = '⚠️';
                
                // 현재 게임 여부에 따른 강조 표시
                const isCurrentGame = (gameId === currentGameId);
                const highlightClass = isCurrentGame ? 'current-game' : '';
                
                // 🔧 핵심 수정: data-game-id 속성 확실히 추가
                const gameEntry = $(`
                    <div class="game-entry ${highlightClass}" data-game-id="${gameId}">
                        <span><strong>마지막 저장:</strong> ${gameDate}</span>
                        <span class="location-info"><strong>위치:</strong> ${currentLocation}</span>
                        <span>❤️ ${health}/${maxHealth} 🧠 ${status} 💰 ${keyItems}</span>
                        <span>⏰ 플레이시간: ${playTime}</span>
                        ${deathCount > 0 ? `<span>💀 사망: ${deathCount}회</span>` : ''}
                        <div class="game-actions">
                            <button class="btn btn-primary load-game-btn" data-game-id="${gameId}">불러오기</button>
                            <button class="btn btn-danger delete-game-btn" data-game-id="${gameId}" style="margin-left: 5px;">삭제</button>
                        </div>
                    </div>
                `);
                
                // 🔧 추가: 버튼 클릭 이벤트 직접 바인딩
                gameEntry.find('.load-game-btn').click(function() {
                    const btnGameId = $(this).data('game-id');
                    console.log('불러오기 버튼 클릭:', btnGameId);
                    window.loadGame(btnGameId);
                });
                
                gameEntry.find('.delete-game-btn').click(function() {
                    const btnGameId = $(this).data('game-id');
                    console.log('삭제 버튼 클릭:', btnGameId);
                    window.deleteGame(btnGameId);
                });
                
                savedGamesList.append(gameEntry);
            });
            
            // 현재 선택된 게임으로 스크롤
            if (currentGameId) {
                const currentGameElement = $(`.game-entry[data-game-id="${currentGameId}"]`);
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
            
            // 🔧 핵심 수정: gameId 설정 및 검증
            const gameId = data.game_id;
            if (!validateGameId(gameId, 'handleGameNew')) {
                alert('서버에서 유효하지 않은 게임 ID를 받았습니다.');
                enableAllButtons();
                return;
            }
            
            // 게임 상태 설정
            setCurrentGameId(gameId);
            gameData = data.game_data;
            GameState.setGameState(gameId, data.game_data);
            
            console.log('새 게임 생성 완료:', {
                game_id: gameId,
                game_data: data.game_data
            });
            
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
                        <button id="game-continue" class="btn btn-primary mt-2">계속 진행</button>
                    </div>
                `);
            }
            
            // 모든 버튼 다시 활성화
            enableAllButtons();
            
            // 어시스턴트 선택 비활성화
            $('#assistant-select').prop('disabled', true);
            
            // 게임 목록 새로고침
            GameSocket.loadGamesList(true);
            
        } else {
            // 로딩 숨기기
            hideLoading();
            
            // 버튼 다시 활성화
            enableAllButtons();
            
            alert('새 게임 시작 중 오류: ' + data.error);
        }
        
        // 채팅창 스크롤
        $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
    }
    
    // 게임 로드 응답 처리
    function handleGameLoad(event, data) {
        // 로딩 숨기기
        hideLoading();
        
        // 버튼 다시 활성화
        enableAllButtons();
        
        if (data.success) {
            console.log('게임 로드 성공:', data);
            
            // 🔧 핵심 수정: 로드된 게임 ID 검증
            const loadedGameId = data.game ? data.game.game_id : null;
            if (!validateGameId(loadedGameId, 'handleGameLoad')) {
                alert('로드된 게임의 ID가 유효하지 않습니다.');
                return;
            }
            
            // 현재 게임 ID와 일치하는지 확인
            if (currentGameId && currentGameId !== loadedGameId) {
                console.warn('현재 게임 ID와 로드된 게임 ID가 다릅니다:', {
                    current: currentGameId,
                    loaded: loadedGameId
                });
            }
            
            // 게임 상태 설정
            setCurrentGameId(loadedGameId);
            gameData = data.game.game_data;
            GameState.setGameState(loadedGameId, data.game.game_data);
            
            // 어시스턴트 선택 비활성화
            $('#assistant-select').prop('disabled', true);
            
            // 이전 메시지 및 버튼 제거
            $('#chatbox').empty();
            
            if (data.summary) {
                // 요약 응답 표시 (사용자 메시지로)
                $('#chatbox').append(`<div class="message user-message">이전 게임 요약: ${data.summary}</div>`);
            }
            
            if (data.initialResponse) {
                // 새 스레드의 응답 표시
                $('#chatbox').append(`<div class="message assistant-message">${data.initialResponse}</div>`);
                
                // 선택지 버튼 생성
                const buttons = createChoiceButtons(data.initialResponse);
                if (buttons) {
                    $('#chatbox').append(buttons);
                }
            } else {
                $('#chatbox').append(`
                    <div class="system-message">
                        게임을 불러왔지만 초기 응답을 받지 못했습니다.
                        <button id="game-continue" class="btn btn-primary mt-2">계속 진행</button>
                    </div>
                `);
            }
            
            // 스크롤 조정
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
            // 게임 목록 강제 갱신
            console.log('게임 목록 강제 갱신 요청');
            GameSocket.loadGamesList(true);
            
        } else {
            console.error('게임 로드 실패:', data.error);
            alert('게임 로드 중 오류: ' + data.error);
        }
    }
    
    // 게임 저장 진행 처리
    function handleGameSaveProgress(event, data) {
        if (data.status === 'saving') {
            showLoading(data.message || '게임을 저장하는 중...');
        }
    }
    
    // 게임 저장 완료 처리
    function handleGameSave(event, data) {
        // 버튼 로딩 상태 해제
        setButtonLoading($('#save-game'), false);
        
        // 로딩 숨기기
        hideLoading();
        
        // 버튼 다시 활성화
        enableAllButtons();
        
        if (data.success) {
            console.log('게임 저장 성공');
            alert('게임이 저장되었습니다.');
            
            // 게임 목록 강제 갱신
            GameSocket.loadGamesList(true);
        } else {
            console.error('게임 저장 실패:', data.error);
            alert('게임 저장 중 오류: ' + data.error);
        }
    }
    
    // 게임 삭제 응답 처리
    function handleGameDelete(event, data) {
        // 로딩 숨기기
        hideLoading();
        
        // 버튼 다시 활성화
        enableAllButtons();
        
        if (data.success) {
            console.log('게임 삭제 성공:', data.game_id);
            
            if (currentGameId === data.game_id) {
                // 현재 게임이 삭제된 경우, 상태 초기화
                clearCurrentGameId();
                gameData = null;
                GameState.clearGameState();
                
                // UI 초기화
                $('#chatbox').empty();
                $('#assistant-select').prop('disabled', false);
            }
            
            alert('게임이 삭제되었습니다.');
            GameSocket.loadGamesList(true);
        } else {
            console.error('게임 삭제 실패:', data.error);
            alert('게임 삭제 중 오류: ' + data.error);
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
        getCurrentGameId: getCurrentGameId,
        setCurrentGameId: setCurrentGameId,
        clearCurrentGameId: clearCurrentGameId,
        validateGameId: validateGameId
    };
})();
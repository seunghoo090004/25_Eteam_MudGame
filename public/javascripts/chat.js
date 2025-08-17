// public/javascripts/chat.js - 업데이트된 버전

const GameChat = (function() {
    
    function initialize() {
        setupEventHandlers();
    }
    
    function setupEventHandlers() {
        // 소켓 이벤트 핸들러 등록
        $(document).on('chat:response', handleChatResponse);
        $(document).on('chat:history', handleChatHistory);
        
        // 선택지 버튼 클릭 핸들러
        $(document).on('click', '.choice-button', handleChoiceClick);
    }
    
    // 채팅 응답 처리 (수정된 파싱 로직)
    function handleChatResponse(event, data) {
        const LOG_HEADER = "CHAT/RESPONSE";
        console.log(`[${LOG_HEADER}] Processing chat response:`, data);
        
        if (data.success) {
            const response = data.response;
            
            // 기존 선택지 버튼 제거
            $('.choice-buttons').remove();
            
            // 응답에서 선택지 텍스트 제거 (↑↓←→ 부분)
            const cleanedResponse = cleanResponseText(response);
            
            // AI 응답 표시
            $('#chatbox').append(`<div class="message assistant-message">${cleanedResponse}</div>`);
            
            // 게임 상태 업데이트
            if (data.game_state) {
                GameState.updateGameData(data.game_state);
            }
            
            // 엔딩 체크
            const endingResult = checkForEnding(cleanedResponse);
            if (endingResult) {
                GameUI.handleGameEnding(endingResult);
                return;
            }
            
            // 선택지 버튼 생성 (원본 응답 기반)
            const choiceButtons = GameUI.createChoiceButtons(response);
            if (choiceButtons) {
                $('#chatbox').append(choiceButtons);
            }
            
            // 스크롤 조정
            $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            
        } else {
            $('#chatbox').append(`<div class="message error">오류: ${data.error}</div>`);
        }
        
        GameUI.hideLoading();
    }
    
    // 응답 텍스트 정리 (선택지 텍스트 제거)
    function cleanResponseText(response) {
        let cleaned = response;
        
        // 1. 선택지 패턴 제거 (↑ ↓ ← → 포함된 줄들)
        cleaned = cleaned.replace(/[↑↓←→]\s*[^\n]*\n?/g, '');
        
        // 2. 빈 줄 정리
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        
        // 3. 시스템 메시지 제거
        cleaned = cleaned.replace(/\[.*?\]/g, '');
        
        // 4. 끝부분 공백 제거
        cleaned = cleaned.trim();
        
        return cleaned;
    }
    
    // 게임 상태 파싱 (새 형식 지원)
    function parseGameStats(response) {
        const stats = {};
        
        // 통계 섹션 찾기
        const statsMatch = response.match(/통계\s*={3,}([\s\S]*?)={3,}/);
        if (statsMatch) {
            const statsContent = statsMatch[1];
            
            // 턴 파싱
            const turnMatch = statsContent.match(/턴:\s*(\d+)/);
            if (turnMatch) {
                stats.turn_count = parseInt(turnMatch[1]);
            }
            
            // 위치 파싱
            const locationMatch = statsContent.match(/위치:\s*([^\n]+)/);
            if (locationMatch) {
                stats.location = {
                    current: locationMatch[1].trim()
                };
            }
            
            // 발견 파싱
            const discoveryMatch = statsContent.match(/발견:\s*([^\n]+)/);
            if (discoveryMatch) {
                const discovery = discoveryMatch[1].trim();
                if (discovery !== '없음' && discovery !== '') {
                    stats.discoveries = [discovery];
                }
            }
            
            // 시간 필드는 무시 (새 지침에서 제거됨)
        }
        
        return Object.keys(stats).length > 0 ? stats : null;
    }
    
    // 엔딩 조건 체크
    function checkForEnding(response) {
        // 사망 체크
        if (response.includes('당신은 죽었습니다') || response.includes('죽었습니다')) {
            const deathCause = extractDeathCause(response);
            return {
                type: 'death',
                cause: deathCause,
                story: response
            };
        }
        
        // 탈출 체크
        const escapeKeywords = ['탈출', '출구', '자유', '밖으로', '빛이 보인다', '성공적으로'];
        if (escapeKeywords.some(keyword => response.includes(keyword))) {
            return {
                type: 'escape',
                story: response
            };
        }
        
        return null;
    }
    
    // 사망 원인 추출
    function extractDeathCause(response) {
        const patterns = [
            /사망 원인[:\s]*([^.\n]+)/i,
            /원인[:\s]*([^.\n]+)/i,
            /([^.\n]+)(?:로|으로|에)\s*인해\s*죽었습니다/i,
            /([^.\n]+)(?:로|으로|에)\s*인해\s*사망/i
        ];

        for (const pattern of patterns) {
            const match = response.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        return '알 수 없는 원인';
    }
    
    // 선택지 버튼 클릭 처리
    function handleChoiceClick() {
        const choice = $(this).data('choice');
        const gameId = GameState.getCurrentGameId();
        
        if (!gameId) {
            alert('게임이 활성화되지 않았습니다.');
            return;
        }
        
        // 로딩 표시
        GameUI.showLoading();
        GameUI.disableAllButtons();
        
        // 사용자 선택 표시
        $('#chatbox').append(`<div class="message user-message">선택: ${choice}</div>`);
        
        // 선택지 버튼 제거
        $('.choice-buttons').remove();
        
        // 소켓으로 메시지 전송
        GameSocket.emit('chat message', {
            game_id: gameId,
            message: choice.toString()
        });
    }
    
    // 채팅 기록 처리
    function handleChatHistory(event, data) {
        if (data.success) {
            const history = data.history;
            
            $('#chatbox').empty();
            
            if (history && history.length > 0) {
                // 시간순 정렬
                const sortedHistory = [...history].sort((a, b) => 
                    new Date(a.created_at) - new Date(b.created_at)
                );
                
                // 메시지 표시 (AI 응답만)
                sortedHistory.forEach(msg => {
                    if (msg.role === 'assistant') {
                        const cleanedContent = cleanResponseText(msg.content);
                        $('#chatbox').append(`<div class="message assistant-message">${cleanedContent}</div>`);
                    }
                });
                
                // 마지막 AI 메시지에 선택지 버튼 추가
                const lastAIMessage = sortedHistory.reverse().find(msg => msg.role === 'assistant');
                if (lastAIMessage && !checkForEnding(lastAIMessage.content)) {
                    const choiceButtons = GameUI.createChoiceButtons(lastAIMessage.content);
                    if (choiceButtons) {
                        $('#chatbox').append(choiceButtons);
                    }
                }
                
                $('#chatbox').scrollTop($('#chatbox')[0].scrollHeight);
            } else {
                $('#chatbox').append(`<div class="system-message">채팅 기록이 없습니다.</div>`);
            }
        } else {
            console.error('채팅 기록을 가져오는 중 오류:', data.error);
            $('#chatbox').append(`<div class="system-message error">채팅 기록을 가져오는 중 오류가 발생했습니다.</div>`);
        }
    }
    
    // 메시지 전송 (외부에서 사용)
    function sendMessage(message) {
        if (!GameSocket.isConnected()) {
            console.error('소켓 연결이 끊어져 메시지를 보낼 수 없습니다.');
            return false;
        }
        
        const currentGameId = GameState.getCurrentGameId();
        if (!currentGameId) {
            console.error('현재 게임이 없어 메시지를 보낼 수 없습니다.');
            return false;
        }
        
        GameSocket.emit('chat message', {
            message: message,
            game_id: currentGameId
        });
        
        return true;
    }
    
    // 채팅 기록 요청
    function getChatHistory() {
        const currentGameId = GameState.getCurrentGameId();
        if (!currentGameId) {
            console.error('현재 게임이 없어 채팅 기록을 가져올 수 없습니다.');
            return false;
        }
        
        GameSocket.emit('get chat history', {
            game_id: currentGameId
        });
        
        return true;
    }
    
    // 공개 API
    return {
        initialize: initialize,
        sendMessage: sendMessage,
        getChatHistory: getChatHistory,
        parseGameStats: parseGameStats,
        checkForEnding: checkForEnding
    };
})();
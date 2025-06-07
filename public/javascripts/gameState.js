// public/js/game/gameState.js - 새로운 파싱 지원

const GameState = (function() {
    let currentGameId = null;
    let gameData = null;
    let processingChoice = false;
    
    function getCurrentGameId() {
        return currentGameId;
    }
    
    function getGameData() {
        return gameData;
    }
    
    function setGameState(id, data) {
        currentGameId = id;
        gameData = data;
    }
    
    function clearGameState() {
        currentGameId = null;
        gameData = null;
        processingChoice = false;
    }
    
    function isProcessingChoice() {
        return processingChoice;
    }
    
    function setProcessingChoice(status) {
        processingChoice = status;
    }
    
    // 새로운 응답 형식에서 위치 정보 추출
    function extractLocationFromResponse(response) {
        if (!response) return null;
        
        // >> 위치: [ID] - [방이름] 형식에서 추출
        const locationPattern = />>\s*위치:\s*([^-]+)\s*-\s*([^\n]+)/;
        const match = response.match(locationPattern);
        
        if (match) {
            return {
                roomId: match[1].trim(),
                roomName: match[2].trim()
            };
        }
        
        return null;
    }
    
    // 기존 요약에서 위치 추출 (호환성 유지)
    function extractLocationFromSummary(summary) {
        if (!summary) return null;
        
        // 패턴 1: "현재 위치는 [위치]" 패턴
        let locationPattern1 = /현재\s*위치(?:는|:)\s*([^,.]+?)(?:로|에서|입니다|에|이며|\.|\,|$)/i;
        let match1 = summary.match(locationPattern1);
        
        // 패턴 2: "위치: [위치]" 패턴
        let locationPattern2 = /위치\s*:\s*([^,.]+?)(?:로|에서|입니다|에|이며|\.|\,|$)/i;
        let match2 = summary.match(locationPattern2);
        
        // 패턴 3: "위치는 [위치]" 패턴
        let locationPattern3 = /위치는\s*([^,.]+?)(?:로|에서|입니다|에|이며|\.|\,|$)/i;
        let match3 = summary.match(locationPattern3);
        
        console.log('요약 내용:', summary);
        console.log('패턴 매칭 결과:', { match1, match2, match3 });
        
        // 매칭된 패턴 중 첫 번째 것 사용
        if (match1) return match1[1].trim();
        if (match2) return match2[1].trim();
        if (match3) return match3[1].trim();
        
        return null;
    }
    
    // STATS 섹션에서 게임 상태 파싱
    function parseStatsFromResponse(response) {
        if (!response) return null;
        
        const gameState = {
            player: {},
            location: {},
            inventory: {}
        };
        
        try {
            // STATS 섹션 추출
            const statsPattern = /STATS[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 체력 정보
                const healthPattern = /체력:\s*(\d+)\/(\d+)/;
                const healthMatch = statsContent.match(healthPattern);
                if (healthMatch) {
                    gameState.player.health = parseInt(healthMatch[1]);
                    gameState.player.maxHealth = parseInt(healthMatch[2]);
                }
                
                // 체력상태
                const statusPattern = /체력상태:\s*([^\s]+)/;
                const statusMatch = statsContent.match(statusPattern);
                if (statusMatch) {
                    gameState.player.status = statusMatch[1];
                }
                
                // 정신상태
                const mentalPattern = /정신:\s*([^\s]+)/;
                const mentalMatch = statsContent.match(mentalPattern);
                if (mentalMatch) {
                    gameState.player.mental = mentalMatch[1];
                }
                
                // 소지품
                const itemsPattern = /소지품:\s*([^\n]+)/;
                const itemsMatch = statsContent.match(itemsPattern);
                if (itemsMatch) {
                    gameState.inventory.keyItems = itemsMatch[1].trim();
                }
                
                // 골드
                const goldPattern = /골드:\s*(\d+)/;
                const goldMatch = statsContent.match(goldPattern);
                if (goldMatch) {
                    gameState.inventory.gold = parseInt(goldMatch[1]);
                }
            }
            
            // 위치 정보 추출
            const locationInfo = extractLocationFromResponse(response);
            if (locationInfo) {
                gameState.location.roomId = locationInfo.roomId;
                gameState.location.current = locationInfo.roomName;
            }
            
            return gameState;
            
        } catch (e) {
            console.error('Stats parsing error:', e);
            return null;
        }
    }
    
    function updateGameLocation(locationInfo) {
        if (gameData && locationInfo) {
            if (typeof locationInfo === 'string') {
                // 문자열인 경우 (기존 호환성)
                gameData.location.current = locationInfo;
            } else if (typeof locationInfo === 'object') {
                // 객체인 경우 (새로운 형식)
                if (locationInfo.roomId) {
                    gameData.location.roomId = locationInfo.roomId;
                }
                if (locationInfo.roomName) {
                    gameData.location.current = locationInfo.roomName;
                }
            }
            
            // 새로운 위치 추가
            if (Array.isArray(gameData.location.discovered) && 
                !gameData.location.discovered.includes(gameData.location.current)) {
                gameData.location.discovered.push(gameData.location.current);
            }
            
            return true;
        }
        return false;
    }
    
    // 게임 상태 업데이트 (새로운 파싱 결과 적용)
    function updateGameStateFromParsing(parsedState) {
        if (!gameData || !parsedState) return false;
        
        let updated = false;
        
        // 위치 정보 업데이트
        if (parsedState.location) {
            if (parsedState.location.current && parsedState.location.current !== gameData.location.current) {
                gameData.location.current = parsedState.location.current;
                updated = true;
                
                // 발견된 위치 목록에 추가
                if (!gameData.location.discovered.includes(parsedState.location.current)) {
                    gameData.location.discovered.push(parsedState.location.current);
                }
            }
            
            if (parsedState.location.roomId) {
                gameData.location.roomId = parsedState.location.roomId;
                updated = true;
            }
        }
        
        // 플레이어 상태 업데이트
        if (parsedState.player) {
            Object.keys(parsedState.player).forEach(key => {
                if (parsedState.player[key] !== undefined && parsedState.player[key] !== gameData.player[key]) {
                    gameData.player[key] = parsedState.player[key];
                    updated = true;
                }
            });
        }
        
        // 인벤토리 업데이트
        if (parsedState.inventory) {
            Object.keys(parsedState.inventory).forEach(key => {
                if (parsedState.inventory[key] !== undefined && parsedState.inventory[key] !== gameData.inventory[key]) {
                    gameData.inventory[key] = parsedState.inventory[key];
                    updated = true;
                }
            });
        }
        
        return updated;
    }
    
    // 게임 이벤트 핸들러 설정
    function setupEventHandlers() {
        // 새 게임 이벤트
        $(document).on('game:new', function(event, data) {
            if (data.success) {
                setGameState(data.game_id, data.game_data);
            }
        });
        
        // 게임 로드 이벤트
        $(document).on('game:load', function(event, data) {
            if (data.success) {
                setGameState(data.game.game_id, data.game.game_data);
            }
        });
        
        // 게임 저장 이벤트
        $(document).on('game:save', function(event, data) {
            if (data.success && data.gameData) {
                // 저장된 게임 데이터로 업데이트
                gameData = data.gameData;
            }
        });
        
        // 게임 삭제 이벤트
        $(document).on('game:delete', function(event, data) {
            if (data.success && currentGameId === data.game_id) {
                clearGameState();
            }
        });
        
        // 채팅 응답 이벤트 (게임 상태 업데이트)
        $(document).on('chat:response', function(event, data) {
            if (data.success && data.game_state) {
                gameData = data.game_state;
            }
        });
    }
    
    function initialize() {
        setupEventHandlers();
    }
    
    // 공개 API
    return {
        initialize: initialize,
        getCurrentGameId: getCurrentGameId,
        getGameData: getGameData,
        setGameState: setGameState,
        clearGameState: clearGameState,
        isProcessingChoice: isProcessingChoice,
        setProcessingChoice: setProcessingChoice,
        extractLocationFromSummary: extractLocationFromSummary,
        extractLocationFromResponse: extractLocationFromResponse,
        parseStatsFromResponse: parseStatsFromResponse,
        updateGameLocation: updateGameLocation,
        updateGameStateFromParsing: updateGameStateFromParsing
    };
})();
// public/javascripts/gameState.js - 상태 관리 개선 버전

const GameState = (function() {
    let currentGameId = null;
    let gameData = null;
    let processingChoice = false;
    let isNewGame = false; // ✅ 추가: 새 게임 여부 추적
    
    function getCurrentGameId() {
        return currentGameId;
    }
    
    function getGameData() {
        return gameData;
    }
    
    function setGameState(id, data, newGame = false) {
        currentGameId = id;
        gameData = data;
        isNewGame = newGame; // ✅ 추가: 새 게임 플래그 설정
        
        console.log('Game state updated:', {
            gameId: id,
            isNewGame: newGame,
            location: data?.location?.current
        });
    }
    
    function clearGameState() {
        currentGameId = null;
        gameData = null;
        processingChoice = false;
        isNewGame = false; // ✅ 추가: 플래그 초기화
    }
    
    function isProcessingChoice() {
        return processingChoice;
    }
    
    function setProcessingChoice(status) {
        processingChoice = status;
    }
    
    // ✅ 추가: 새 게임 여부 확인
    function isNewGameState() {
        return isNewGame;
    }
    
    // ✅ 추가: 새 게임 플래그 해제
    function clearNewGameFlag() {
        isNewGame = false;
    }
    
    function extractLocationFromResponse(response) {
        if (!response) return null;
        
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
    
    function extractLocationFromSummary(summary) {
        if (!summary) return null;
        
        let locationPattern1 = /현재\s*위치(?:는|:)\s*([^,.]+?)(?:로|에서|입니다|에|이며|\.|\,|$)/i;
        let match1 = summary.match(locationPattern1);
        
        let locationPattern2 = /위치\s*:\s*([^,.]+?)(?:로|에서|입니다|에|이며|\.|\,|$)/i;
        let match2 = summary.match(locationPattern2);
        
        let locationPattern3 = /위치는\s*([^,.]+?)(?:로|에서|입니다|에|이며|\.|\,|$)/i;
        let match3 = summary.match(locationPattern3);
        
        if (match1) return match1[1].trim();
        if (match2) return match2[1].trim();
        if (match3) return match3[1].trim();
        
        return null;
    }
    
    function parseStatsFromResponse(response) {
        if (!response) return null;
        
        const gameState = {
            player: {},
            location: {},
            inventory: {}
        };
        
        try {
            const statsPattern = /STATS[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                const healthPattern = /체력:\s*(\d+)\/(\d+)/;
                const healthMatch = statsContent.match(healthPattern);
                if (healthMatch) {
                    gameState.player.health = parseInt(healthMatch[1]);
                    gameState.player.maxHealth = parseInt(healthMatch[2]);
                }
                
                const statusPattern = /체력상태:\s*([^\s]+)/;
                const statusMatch = statsContent.match(statusPattern);
                if (statusMatch) {
                    gameState.player.status = statusMatch[1];
                }
                
                const mentalPattern = /정신:\s*([^\s]+)/;
                const mentalMatch = statsContent.match(mentalPattern);
                if (mentalMatch) {
                    gameState.player.mental = mentalMatch[1];
                }
                
                const itemsPattern = /소지품:\s*([^\n]+)/;
                const itemsMatch = statsContent.match(itemsPattern);
                if (itemsMatch) {
                    gameState.inventory.keyItems = itemsMatch[1].trim();
                }
                
                const goldPattern = /골드:\s*(\d+)/;
                const goldMatch = statsContent.match(goldPattern);
                if (goldMatch) {
                    gameState.inventory.gold = parseInt(goldMatch[1]);
                }
            }
            
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
                gameData.location.current = locationInfo;
            } else if (typeof locationInfo === 'object') {
                if (locationInfo.roomId) {
                    gameData.location.roomId = locationInfo.roomId;
                }
                if (locationInfo.roomName) {
                    gameData.location.current = locationInfo.roomName;
                }
            }
            
            if (Array.isArray(gameData.location.discovered) && 
                !gameData.location.discovered.includes(gameData.location.current)) {
                gameData.location.discovered.push(gameData.location.current);
            }
            
            return true;
        }
        return false;
    }
    
    function updateGameStateFromParsing(parsedState) {
        if (!gameData || !parsedState) return false;
        
        let updated = false;
        
        if (parsedState.location) {
            if (parsedState.location.current && parsedState.location.current !== gameData.location.current) {
                gameData.location.current = parsedState.location.current;
                updated = true;
                
                if (!gameData.location.discovered.includes(parsedState.location.current)) {
                    gameData.location.discovered.push(parsedState.location.current);
                }
            }
            
            if (parsedState.location.roomId) {
                gameData.location.roomId = parsedState.location.roomId;
                updated = true;
            }
        }
        
        if (parsedState.player) {
            Object.keys(parsedState.player).forEach(key => {
                if (parsedState.player[key] !== undefined && parsedState.player[key] !== gameData.player[key]) {
                    gameData.player[key] = parsedState.player[key];
                    updated = true;
                }
            });
        }
        
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
    
    function setupEventHandlers() {
        // ✅ 수정: 새 게임 이벤트 - 플래그 설정
        $(document).on('game:new', function(event, data) {
            if (data.success) {
                setGameState(data.game_id, data.game_data, true); // 새 게임 플래그
            }
        });
        
        // ✅ 수정: 게임 로드 이벤트 - 기존 게임
        $(document).on('game:load', function(event, data) {
            if (data.success) {
                setGameState(data.game.game_id, data.game.game_data, false); // 기존 게임
            }
        });
        
        $(document).on('game:save', function(event, data) {
            if (data.success && data.gameData) {
                gameData = data.gameData;
                isNewGame = false; // 저장 후 기존 게임으로 전환
            }
        });
        
        $(document).on('game:delete', function(event, data) {
            if (data.success && currentGameId === data.game_id) {
                clearGameState();
            }
        });
        
        // ✅ 수정: 채팅 응답 이벤트 - 새 게임 플래그 해제
        $(document).on('chat:response', function(event, data) {
            if (data.success && data.game_state) {
                gameData = data.game_state;
                if (isNewGame) {
                    isNewGame = false; // 첫 응답 후 플래그 해제
                }
            }
        });
    }
    
    function initialize() {
        setupEventHandlers();
    }
    
    return {
        initialize: initialize,
        getCurrentGameId: getCurrentGameId,
        getGameData: getGameData,
        setGameState: setGameState,
        clearGameState: clearGameState,
        isProcessingChoice: isProcessingChoice,
        setProcessingChoice: setProcessingChoice,
        isNewGameState: isNewGameState, // ✅ 추가
        clearNewGameFlag: clearNewGameFlag, // ✅ 추가
        extractLocationFromSummary: extractLocationFromSummary,
        extractLocationFromResponse: extractLocationFromResponse,
        parseStatsFromResponse: parseStatsFromResponse,
        updateGameLocation: updateGameLocation,
        updateGameStateFromParsing: updateGameStateFromParsing
    };
})();
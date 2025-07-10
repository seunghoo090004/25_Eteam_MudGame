// public/javascripts/gameState.js - 수정된 버전

const GameState = (function() {
    let currentGameId = null;
    let gameData = null;
    let processingChoice = false;
    let isNewGame = false;
    
    function getCurrentGameId() {
        return currentGameId;
    }
    
    function getGameData() {
        return gameData;
    }
    
    function setGameState(id, data, newGame = false) {
        currentGameId = id;
        gameData = data;
        isNewGame = newGame;
        
        console.log('Game state updated:', {
            gameId: id,
            isNewGame: newGame,
            turn: data?.turn_count,
            location: data?.location?.current
        });
    }
    
    function clearGameState() {
        currentGameId = null;
        gameData = null;
        processingChoice = false;
        isNewGame = false;
    }
    
    function isProcessingChoice() {
        return processingChoice;
    }
    
    function setProcessingChoice(status) {
        processingChoice = status;
    }
    
    function isNewGameState() {
        return isNewGame;
    }
    
    function clearNewGameFlag() {
        isNewGame = false;
    }
    
    function incrementTurn() {
        if (gameData) {
            gameData.turn_count = (gameData.turn_count || 1) + 1;
            console.log(`Turn incremented to: ${gameData.turn_count}`);
        }
    }
    
    function incrementDeathCount() {
        if (gameData) {
            gameData.death_count = (gameData.death_count || 0) + 1;
            console.log(`Death count incremented to: ${gameData.death_count}`);
        }
    }
    
    function updateLocation(newLocation) {
        if (gameData && newLocation) {
            gameData.location = gameData.location || {};
            gameData.location.current = newLocation;
            console.log('Location updated:', newLocation);
        }
    }
    
    function parseStatsFromResponse(response) {
        if (!response) return null;
        
        const gameState = {
            turn_count: null,
            location: { current: null },
            is_death: false
        };
        
        try {
            if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
                gameState.is_death = true;
                
                const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                                response.match(/([^.\n]+)로 인해 죽었습니다/i);
                if (deathMatch) {
                    gameState.death_cause = deathMatch[1].trim();
                }
            }
            
            const statsPattern = /STATS[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                const turnPattern = /Turn:\s*(\d+)/;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.turn_count = parseInt(turnMatch[1]);
                }
                
                const locationPattern = /Location:\s*([^\n]+)/;
                const locationMatch = statsContent.match(locationPattern);
                if (locationMatch) {
                    gameState.location.current = locationMatch[1].trim();
                }
            }
            
            console.log('Parsed game state:', gameState);
            return gameState;
            
        } catch (e) {
            console.error('Stats parsing error:', e);
            return null;
        }
    }
    
    function updateGameStateFromParsing(parsedState) {
        if (!gameData || !parsedState) return false;
        
        let updated = false;
        
        if (parsedState.turn_count && parsedState.turn_count !== gameData.turn_count) {
            gameData.turn_count = parsedState.turn_count;
            updated = true;
            console.log(`Turn updated to: ${parsedState.turn_count}`);
        }
        
        if (parsedState.location && parsedState.location.current) {
            const oldLocation = gameData.location?.current;
            if (!gameData.location) gameData.location = {};
            gameData.location.current = parsedState.location.current;
            
            if (oldLocation !== parsedState.location.current) {
                updated = true;
                console.log('Location changed:', oldLocation, '->', parsedState.location.current);
            }
        }
        
        return updated;
    }
    
    function checkEndingConditions(response) {
        if (!response || !gameData) return null;
        
        if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
            let deathCause = "알 수 없는 원인";
            const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                            response.match(/([^.\n]+)로 인해 죽었습니다/i);
            if (deathMatch) {
                deathCause = deathMatch[1].trim();
            }
            
            return {
                type: 'death',
                cause: deathCause,
                final_turn: gameData.turn_count || 1,
                total_deaths: (gameData.death_count || 0) + 1,
                discoveries: [],
                discoveries_count: 0
            };
        }
        
        if (gameData.turn_count >= 11) {
            const escapeKeywords = ['탈출', '출구', '자유', '밖으로', '빛이 보인다', '성공적으로'];
            const hasEscapeKeyword = escapeKeywords.some(keyword => 
                response.includes(keyword)
            );
            
            if (hasEscapeKeyword) {
                return {
                    type: 'escape',
                    cause: null,
                    final_turn: gameData.turn_count || 1,
                    total_deaths: gameData.death_count || 0,
                    discoveries: [],
                    discoveries_count: 0
                };
            }
        }
        
        return null;
    }
    
    function setupEventHandlers() {
        $(document).on('game:new', function(event, data) {
            if (data.success) {
                setGameState(data.game_id, data.game_data, true);
            }
        });
        
        $(document).on('game:load', function(event, data) {
            if (data.success) {
                setGameState(data.game.game_id, data.game.game_data, false);
            }
        });
        
        $(document).on('game:delete', function(event, data) {
            if (data.success && currentGameId === data.game_id) {
                clearGameState();
            }
        });
        
        $(document).on('chat:response', function(event, data) {
            if (data.success && data.game_state) {
                gameData = data.game_state;
                if (isNewGame) {
                    isNewGame = false;
                }
            }
        });
        
        $(document).on('game:ending', function(event, data) {
            if (data.success) {
                console.log('Game ended:', data.ending_data);
                // 엔딩 처리 후 게임 상태는 UI에서 자동 삭제됨
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
        isNewGameState: isNewGameState,
        clearNewGameFlag: clearNewGameFlag,
        incrementTurn: incrementTurn,
        incrementDeathCount: incrementDeathCount,
        updateLocation: updateLocation,
        parseStatsFromResponse: parseStatsFromResponse,
        updateGameStateFromParsing: updateGameStateFromParsing,
        checkEndingConditions: checkEndingConditions
    };
})();
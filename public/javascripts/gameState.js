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
            discoveries: [],
            is_death: false
        };
        
        try {
            // 사망 체크
            if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
                gameState.is_death = true;
                
                const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                                response.match(/([^.\n]+)로 인해 죽었습니다/i);
                if (deathMatch) {
                    gameState.death_cause = deathMatch[1].trim();
                }
            }
            
            // 수정된 STATS 파싱 (한글 "통계" 사용, Time 제거)
            const statsPattern = /통계[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 턴 정보 파싱
                const turnPattern = /턴[:\s]*(\d+)/;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.turn_count = parseInt(turnMatch[1]);
                }
                
                // 위치 정보 파싱
                const locationPattern = /위치[:\s]*([^\n]+)/;
                const locationMatch = statsContent.match(locationPattern);
                if (locationMatch) {
                    gameState.location.current = locationMatch[1].trim();
                }
                
                // 발견 정보 파싱
                const discoveryPattern = /발견[:\s]*([^\n]+)/;
                const discoveryMatch = statsContent.match(discoveryPattern);
                if (discoveryMatch) {
                    const discoveryText = discoveryMatch[1].trim();
                    if (discoveryText !== '없음' && discoveryText !== 'None' && discoveryText !== '') {
                        gameState.discoveries = discoveryText.split(',').map(d => d.trim()).filter(d => d);
                    }
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

        // 발견 정보 업데이트
        if (parsedState.discoveries && parsedState.discoveries.length > 0) {
            if (!gameData.discoveries) gameData.discoveries = [];
            
            parsedState.discoveries.forEach(discovery => {
                if (!gameData.discoveries.includes(discovery)) {
                    gameData.discoveries.push(discovery);
                    updated = true;
                    console.log('New discovery added:', discovery);
                }
            });
        }
        
        return updated;
    }
    
    function checkEndingConditions(response) {
        if (!response || !gameData) return null;
        
        // 사망 체크
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
                discoveries: gameData.discoveries || [],
                discoveries_count: (gameData.discoveries || []).length
            };
        }
        
        // 탈출 체크 (11턴 이후)
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
                    discoveries: gameData.discoveries || [],
                    discoveries_count: (gameData.discoveries || []).length
                };
            }
        }
        
        return null;
    }
    
    function setupEventHandlers() {
        $(document).on('game:new', function(event, data) {
            if (data.success) {
                setGameState(data.game_id, data.game_data, true);
                console.log('New game state set from socket');
            }
        });
        
        $(document).on('game:load', function(event, data) {
            if (data.success) {
                setGameState(data.game.game_id, data.game.game_data);
                console.log('Game state loaded from socket');
            }
        });
        
        $(document).on('chat:response', function(event, data) {
            if (data.success && data.response) {
                const parsedState = parseStatsFromResponse(data.response);
                if (parsedState) {
                    updateGameStateFromParsing(parsedState);
                }
                
                const endingCondition = checkEndingConditions(data.response);
                if (endingCondition) {
                    $(document).trigger('game:ending', [endingCondition]);
                }
            }
        });
    }
    
    function initialize() {
        setupEventHandlers();
        console.log('GameState initialized');
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
// public/javascripts/gameState.js - 한글 파싱 및 16턴 시스템

const GameState = (function() {
    let currentGameId = null;
    let gameData = null;
    let processingChoice = false;
    let isNewGame = false;
    
    function parseStatsFromResponse(response) {
        const LOG_HEADER = "GAMESTATE/PARSE_STATS";
        
        try {
            if (!response || typeof response !== 'string') {
                console.error(`[${LOG_HEADER}] Invalid response`);
                return null;
            }
            
            const gameState = {
                turn_count: 1,
                death_count: 0,
                location: { current: "" },
                discoveries: []
            };
            
            // 한글 STATS 섹션 파싱
            const statsPattern = /통계[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                console.log(`[${LOG_HEADER}] Found stats section:`, statsContent);
                
                // 턴 정보 (한글)
                const turnPattern = /턴:\s*(\d+)/;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.turn_count = parseInt(turnMatch[1]);
                }
                
                // 위치 정보 (한글)
                const locationPattern = /위치:\s*([^\n]+)/;
                const locationMatch = statsContent.match(locationPattern);
                if (locationMatch) {
                    gameState.location.current = locationMatch[1].trim();
                }
                
                // 발견 정보 (한글)
                const discoveryPattern = /발견:\s*([^\n]+)/;
                const discoveryMatch = statsContent.match(discoveryPattern);
                if (discoveryMatch) {
                    const discoveryText = discoveryMatch[1].trim();
                    if (discoveryText !== '없음' && discoveryText !== 'None' && discoveryText !== '') {
                        gameState.discoveries = discoveryText.split(',').map(d => d.trim()).filter(d => d);
                    }
                }
            }

            console.log(`[${LOG_HEADER}] Parsed game state:`, gameState);
            return gameState;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Parse error:`, e);
            return null;
        }
    }
    
    function updateGameStateFromParsing(parsedState) {
        if (!parsedState || !gameData) return false;
        
        let updated = false;
        
        if (parsedState.turn_count && parsedState.turn_count !== gameData.turn_count) {
            gameData.turn_count = parsedState.turn_count;
            updated = true;
        }
        
        if (parsedState.location && parsedState.location.current) {
            if (!gameData.location) gameData.location = {};
            if (parsedState.location.current !== gameData.location.current) {
                gameData.location.current = parsedState.location.current;
                updated = true;
            }
        }
        
        if (parsedState.discoveries && parsedState.discoveries.length > 0) {
            gameData.discoveries = parsedState.discoveries;
            updated = true;
        }
        
        return updated;
    }
    
    function checkEndingConditions(response) {
        if (!response || !gameData) return null;
        
        // 사망 엔딩
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
        
        // 탈출 엔딩 (13턴+ 변경)
        if (gameData.turn_count >= 13) {
            const escapeKeywords = ['탈출', '성공', '자유', '밖으로', '빛이 보인다'];
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
    
    function getTurnDifficulty(turn) {
        if (turn <= 3) return { phase: "초급", survivalRate: 0.5 };
        if (turn <= 7) return { phase: "중급", survivalRate: 0.25 };
        if (turn <= 12) return { phase: "고급", survivalRate: 0.25 };
        return { phase: "최종", survivalRate: 0.75 };
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
            }
        });
    }
    
    function getCurrentGameId() {
        return currentGameId;
    }
    
    function getGameData() {
        return gameData;
    }
    
    function setGameState(gameId, data, newGame = false) {
        currentGameId = gameId;
        gameData = data;
        isNewGame = newGame;
        console.log('Game state set:', { gameId, data, newGame });
    }
    
    function clearGameState() {
        currentGameId = null;
        gameData = null;
        processingChoice = false;
        isNewGame = false;
        console.log('Game state cleared');
    }
    
    function isProcessingChoice() {
        return processingChoice;
    }
    
    function setProcessingChoice(processing) {
        processingChoice = processing;
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
        }
    }
    
    function incrementDeathCount() {
        if (gameData) {
            gameData.death_count = (gameData.death_count || 0) + 1;
        }
    }
    
    function updateLocation(location) {
        if (gameData) {
            if (!gameData.location) gameData.location = {};
            gameData.location.current = location;
        }
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
        checkEndingConditions: checkEndingConditions,
        getTurnDifficulty: getTurnDifficulty
    };
})();
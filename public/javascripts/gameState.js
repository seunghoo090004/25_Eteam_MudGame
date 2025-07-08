// public/javascripts/gameState.js - 10턴 데스 게임 대응 버전

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
        gameData = normalizeGameData(data);
        isNewGame = newGame;
        
        console.log('Game state updated:', {
            gameId: id,
            isNewGame: newGame,
            turnCount: gameData?.progress?.turnCount || 0,
            escapePhase: gameData?.progress?.escapePhase || false,
            location: gameData?.location?.current
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
    
    // ✅ 새로 추가: 턴 증가 함수
    function incrementTurn() {
        if (gameData && gameData.progress) {
            gameData.progress.turnCount++;
            
            // 11턴 이후 탈출 모드 활성화
            if (gameData.progress.turnCount >= 11) {
                gameData.progress.escapePhase = true;
            }
            
            console.log(`Turn ${gameData.progress.turnCount} - Escape phase: ${gameData.progress.escapePhase}`);
        }
    }
    
    // ✅ 새로 추가: 사망 처리
    function handleDeath() {
        if (gameData && gameData.progress) {
            gameData.progress.deathCount++;
            gameData.player.health = 0;
            
            console.log(`Player death #${gameData.progress.deathCount}`);
        }
    }
    
    // ✅ 새로 추가: 엔딩 조건 체크
    function checkEndingConditions(aiResponse) {
        if (!gameData) return null;
        
        // 사망 체크
        if (gameData.player.health <= 0) {
            return {
                type: 'death',
                turnCount: gameData.progress.turnCount,
                deathCount: gameData.progress.deathCount,
                cause: 'health_zero'
            };
        }
        
        // 탈출 체크 (11턴 이후)
        if (gameData.progress.escapePhase && aiResponse) {
            const escapeKeywords = ['탈출구', '출구', '자유', '탈출 성공', '던전을 벗어나'];
            const hasEscapeKeyword = escapeKeywords.some(keyword => 
                aiResponse.includes(keyword)
            );
            
            if (hasEscapeKeyword) {
                return {
                    type: 'escape',
                    turnCount: gameData.progress.turnCount,
                    deathCount: gameData.progress.deathCount,
                    escapeMethod: 'survival'
                };
            }
        }
        
        return null;
    }
    
    // ✅ 수정: 게임 데이터 정규화 (턴 카운트 포함)
    function normalizeGameData(data) {
        let gameDataObj;
        
        try {
            gameDataObj = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (err) {
            gameDataObj = getDefaultGameData();
        }
        
        // 기본 구조 보장
        gameDataObj.player = gameDataObj.player || {};
        gameDataObj.player.health = gameDataObj.player.health || 100;
        gameDataObj.player.maxHealth = gameDataObj.player.maxHealth || 100;
        gameDataObj.player.status = gameDataObj.player.status || '양호';
        gameDataObj.player.mental = gameDataObj.player.mental || '안정';
        
        gameDataObj.location = gameDataObj.location || {};
        gameDataObj.location.current = gameDataObj.location.current || "던전 입구";
        gameDataObj.location.roomId = gameDataObj.location.roomId || "001";
        
        gameDataObj.inventory = gameDataObj.inventory || {};
        gameDataObj.inventory.items = gameDataObj.inventory.items || [];
        gameDataObj.inventory.gold = gameDataObj.inventory.gold || 0;
        gameDataObj.inventory.keyItems = gameDataObj.inventory.keyItems || '없음';
        
        gameDataObj.progress = gameDataObj.progress || {};
        gameDataObj.progress.playTime = gameDataObj.progress.playTime || "방금 시작";
        gameDataObj.progress.deathCount = gameDataObj.progress.deathCount || 0;
        
        // ✅ 새로 추가: 턴 관련 필드
        gameDataObj.progress.turnCount = gameDataObj.progress.turnCount || 0;
        gameDataObj.progress.escapePhase = gameDataObj.progress.escapePhase || false;
        
        return gameDataObj;
    }
    
    function getDefaultGameData() {
        return {
            player: {
                name: "플레이어",
                level: 1,
                health: 100,
                maxHealth: 100,
                status: '양호',
                mental: '안정'
            },
            location: {
                roomId: "001",
                current: "던전 입구",
                discovered: ["던전 입구"]
            },
            inventory: {
                items: [],
                gold: 0,
                keyItems: '없음'
            },
            progress: {
                deathCount: 0,
                discoveries: '없음',
                puzzlesSolved: 0,
                phase: "생존",
                playTime: "방금 시작",
                lastAction: "게임 시작",
                // ✅ 새로 추가
                turnCount: 0,
                escapePhase: false,
                flags: {
                    tutorialComplete: false,
                    foundEscapeClue: false
                }
            }
        };
    }
    
    // 기존 함수들 유지
    function forceLocationUpdate(response) {
        if (!gameData || !response) return false;
        
        const locationMatch = response.match(/위치:\s*(\w+)\s*-\s*([^=\n]+)/);
        if (locationMatch) {
            const newRoomId = locationMatch[1].trim();
            const newLocation = locationMatch[2].trim();
            
            if (gameData.location.current !== newLocation || gameData.location.roomId !== newRoomId) {
                gameData.location.current = newLocation;
                gameData.location.roomId = newRoomId;
                
                if (!gameData.location.discovered.includes(newLocation)) {
                    gameData.location.discovered.push(newLocation);
                }
                
                console.log('Location updated:', gameData.location);
                return true;
            }
        }
        return false;
    }
    
    function parseStatsFromResponse(response) {
        if (!response) return null;
        
        const gameState = {
            player: {},
            location: {},
            inventory: {},
            progress: {}
        };
        
        try {
            // 위치 정보 파싱
            const locationMatch = response.match(/위치:\s*([^=\n]+)/);
            if (locationMatch) {
                gameState.location.current = locationMatch[1].trim();
            }
            
            // 체력 정보 파싱
            const healthMatch = response.match(/체력:\s*(\d+)\/(\d+)/);
            if (healthMatch) {
                gameState.player.health = parseInt(healthMatch[1]);
                gameState.player.maxHealth = parseInt(healthMatch[2]);
            }
            
            // 턴 수 파싱
            const turnMatch = response.match(/턴\s*수?:\s*(\d+)/);
            if (turnMatch) {
                gameState.progress.turnCount = parseInt(turnMatch[1]);
                gameState.progress.escapePhase = gameState.progress.turnCount >= 11;
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
        
        // 위치 정보 업데이트
        if (parsedState.location && parsedState.location.current) {
            const oldLocation = gameData.location.current;
            gameData.location.current = parsedState.location.current;
            
            if (oldLocation !== parsedState.location.current) {
                updated = true;
                if (!gameData.location.discovered.includes(parsedState.location.current)) {
                    gameData.location.discovered.push(parsedState.location.current);
                }
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
        
        // 진행 상태 업데이트
        if (parsedState.progress) {
            Object.keys(parsedState.progress).forEach(key => {
                if (parsedState.progress[key] !== undefined && parsedState.progress[key] !== gameData.progress[key]) {
                    gameData.progress[key] = parsedState.progress[key];
                    updated = true;
                }
            });
        }
        
        return updated;
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
        
        $(document).on('game:save', function(event, data) {
            if (data.success && data.gameData) {
                gameData = normalizeGameData(data.gameData);
                isNewGame = false;
            }
        });
        
        $(document).on('game:delete', function(event, data) {
            if (data.success && currentGameId === data.game_id) {
                clearGameState();
            }
        });
        
        $(document).on('chat:response', function(event, data) {
            if (data.success && data.game_state) {
                gameData = normalizeGameData(data.game_state);
                if (isNewGame) {
                    isNewGame = false;
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
        isNewGameState: isNewGameState,
        clearNewGameFlag: clearNewGameFlag,
        
        // ✅ 새로 추가된 함수들
        incrementTurn: incrementTurn,
        handleDeath: handleDeath,
        checkEndingConditions: checkEndingConditions,
        normalizeGameData: normalizeGameData,
        
        // 기존 함수들
        forceLocationUpdate: forceLocationUpdate,
        parseStatsFromResponse: parseStatsFromResponse,
        updateGameStateFromParsing: updateGameStateFromParsing
    };
})();
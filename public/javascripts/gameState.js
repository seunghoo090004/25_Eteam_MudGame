// public/javascripts/gameState.js - 상태 관리 개선 버전

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
    
    // ✅ 추가: 강제 위치 업데이트 함수
    function forceLocationUpdate(response) {
        if (!gameData || !response) return false;
        
        const locationMatch = response.match(/위치:\s*(\w+)\s*-\s*([^=\n]+)/);
        if (locationMatch) {
            const newRoomId = locationMatch[1].trim();
            const newLocation = locationMatch[2].trim();
            
            console.log('Location update attempt:', {
                current: gameData.location.current,
                new: newLocation,
                roomId: newRoomId
            });
            
            // 위치가 실제로 변경되었는지 확인
            if (gameData.location.current !== newLocation || gameData.location.roomId !== newRoomId) {
                gameData.location.current = newLocation;
                gameData.location.roomId = newRoomId;
                
                // 발견한 위치 목록에 추가
                if (!gameData.location.discovered.includes(newLocation)) {
                    gameData.location.discovered.push(newLocation);
                }
                
                console.log('Location updated successfully:', gameData.location);
                return true;
            }
        }
        return false;
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
    
    // ✅ 수정: parseStatsFromResponse 개선
    function parseStatsFromResponse(response) {
        if (!response) return null;
        
        const gameState = {
            player: {},
            location: {},
            inventory: {}
        };
        
        try {
            // 위치 정보 강제 파싱
            const locationMatch = response.match(/위치:\s*(\w+)\s*-\s*([^=\n]+)/);
            if (locationMatch) {
                gameState.location.roomId = locationMatch[1].trim();
                gameState.location.current = locationMatch[2].trim();
            }
            
            // STATS 섹션 파싱
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
                const statusPattern = /체력상태:\s*([^\s\n]+)/;
                const statusMatch = statsContent.match(statusPattern);
                if (statusMatch) {
                    gameState.player.status = statusMatch[1];
                }
                
                // 정신상태
                const mentalPattern = /정신:\s*([^\s\n]+)/;
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
            
            console.log('Parsed game state:', gameState);
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
    
    // ✅ 수정: updateGameStateFromParsing 강화
    function updateGameStateFromParsing(parsedState) {
        if (!gameData || !parsedState) return false;
        
        let updated = false;
        
        // 위치 정보 업데이트 - 강제 적용
        if (parsedState.location) {
            if (parsedState.location.current) {
                const oldLocation = gameData.location.current;
                gameData.location.current = parsedState.location.current;
                
                if (oldLocation !== parsedState.location.current) {
                    updated = true;
                    console.log('Location changed:', oldLocation, '->', parsedState.location.current);
                }
                
                if (!gameData.location.discovered.includes(parsedState.location.current)) {
                    gameData.location.discovered.push(parsedState.location.current);
                    updated = true;
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
                    console.log(`Player ${key} updated:`, gameData.player[key]);
                }
            });
        }
        
        // 인벤토리 업데이트
        if (parsedState.inventory) {
            Object.keys(parsedState.inventory).forEach(key => {
                if (parsedState.inventory[key] !== undefined && parsedState.inventory[key] !== gameData.inventory[key]) {
                    gameData.inventory[key] = parsedState.inventory[key];
                    updated = true;
                    console.log(`Inventory ${key} updated:`, gameData.inventory[key]);
                }
            });
        }
        
        if (updated) {
            console.log('Game state updated:', gameData);
        }
        
        return updated;
    }
    
    // ✅ 추가: 게임 진행 검증 함수
    function validateGameProgress(response) {
        if (!response || !gameData) return false;
        
        // 응답에서 새로운 내용 검증
        const hasNewLocation = response.includes('위치:') && 
                              !response.includes(gameData.location.current);
        
        const hasNewDescription = response.length > 500; // 충분한 설명이 있는지
        
        const hasChoices = (response.match(/[↑↓←→]/g) || []).length >= 4;
        
        console.log('Progress validation:', {
            hasNewLocation,
            hasNewDescription,
            hasChoices,
            currentLocation: gameData.location.current
        });
        
        return hasNewLocation || hasNewDescription && hasChoices;
    }
    
    function setupEventHandlers() {
        // 새 게임 이벤트 - 플래그 설정
        $(document).on('game:new', function(event, data) {
            if (data.success) {
                setGameState(data.game_id, data.game_data, true);
            }
        });
        
        // 게임 로드 이벤트 - 기존 게임
        $(document).on('game:load', function(event, data) {
            if (data.success) {
                setGameState(data.game.game_id, data.game.game_data, false);
            }
        });
        
        $(document).on('game:save', function(event, data) {
            if (data.success && data.gameData) {
                gameData = data.gameData;
                isNewGame = false;
            }
        });
        
        $(document).on('game:delete', function(event, data) {
            if (data.success && currentGameId === data.game_id) {
                clearGameState();
            }
        });
        
        // 채팅 응답 이벤트 - 새 게임 플래그 해제
        $(document).on('chat:response', function(event, data) {
            if (data.success && data.game_state) {
                gameData = data.game_state;
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
        forceLocationUpdate: forceLocationUpdate,
        validateGameProgress: validateGameProgress,
        extractLocationFromSummary: extractLocationFromSummary,
        extractLocationFromResponse: extractLocationFromResponse,
        parseStatsFromResponse: parseStatsFromResponse,
        updateGameLocation: updateGameLocation,
        updateGameStateFromParsing: updateGameStateFromParsing
    };
})();
// public/js/game/gameState.js
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
    
    function updateGameLocation(locationFromSummary) {
        if (gameData && locationFromSummary) {
            gameData.location.current = locationFromSummary;
            
            // 새로운 위치 추가
            if (Array.isArray(gameData.location.discovered) && 
                !gameData.location.discovered.includes(locationFromSummary)) {
                gameData.location.discovered.push(locationFromSummary);
            }
            
            return true;
        }
        return false;
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
            if (data.success && data.extractedLocation) {
                updateGameLocation(data.extractedLocation);
            }
        });
        
        // 게임 삭제 이벤트
        $(document).on('game:delete', function(event, data) {
            if (data.success && currentGameId === data.game_id) {
                clearGameState();
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
        updateGameLocation: updateGameLocation
    };
})();
// routes/socket/services/game.js - Socket 전용 게임 서비스

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class GameService {
    
    // ✅ 유지: Socket용 간소화된 게임 로드
    async loadGameForSocket(gameId, userId) {
        const LOG_HEADER = "SOCKET_GAME_SERVICE/LOAD";
        
        try {
            const connection = await pool.getConnection();
            try {
                const [games] = await connection.query(
                    'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                    [gameId, userId]
                );

                if (games.length === 0) {
                    throw new Error("Game not found");
                }

                const gameData = games[0];
                
                if (!gameData.thread_id) {
                    throw new Error("Invalid thread ID");
                }
                
                // 메시지 히스토리 가져오기
                let chatHistory = [];
                try {
                    const messages = await openai.beta.threads.messages.list(gameData.thread_id);
                    chatHistory = messages.data.map(msg => {
                        let content = "메시지 내용을 불러올 수 없습니다.";
                        try {
                            if (msg.content && msg.content.length > 0 && msg.content[0].text) {
                                content = msg.content[0].text.value;
                            }
                        } catch (contentError) {
                            console.error(`${LOG_HEADER} Message content error:`, contentError);
                        }
                        
                        return {
                            role: msg.role,
                            content: content,
                            created_at: new Date(msg.created_at * 1000)
                        };
                    });
                } catch (messageError) {
                    console.error(`${LOG_HEADER} Error fetching messages:`, messageError);
                    chatHistory = [];
                }

                // 게임 데이터 파싱
                let parsedGameData = this.normalizeGameData(gameData.game_data);
                
                console.log(`[${LOG_HEADER}] Game loaded for socket: ${gameId}`);
                return {
                    ...gameData,
                    game_data: parsedGameData,
                    chatHistory
                };

            } finally {
                connection.release();
            }

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    // ✅ 유지: 게임 데이터 정규화 (공통 유틸리티)
    normalizeGameData(gameData) {
        let gameDataObj;
        
        try {
            gameDataObj = typeof gameData === 'string' 
                ? JSON.parse(gameData) 
                : gameData;
        } catch (err) {
            console.error("Game data parsing error:", err);
            gameDataObj = this.getDefaultGameData();
        }
        
        // 기본 구조 보장
        gameDataObj.player = gameDataObj.player || {};
        gameDataObj.player.health = gameDataObj.player.health || 100;
        gameDataObj.player.maxHealth = gameDataObj.player.maxHealth || 100;
        gameDataObj.player.status = gameDataObj.player.status || '양호';
        gameDataObj.player.mental = gameDataObj.player.mental || '안정';
        
        gameDataObj.location = gameDataObj.location || {};
        gameDataObj.location.current = gameDataObj.location.current || "알 수 없는 곳";
        gameDataObj.location.roomId = gameDataObj.location.roomId || "001";
        
        gameDataObj.inventory = gameDataObj.inventory || {};
        gameDataObj.inventory.items = gameDataObj.inventory.items || [];
        gameDataObj.inventory.gold = gameDataObj.inventory.gold || 0;
        gameDataObj.inventory.keyItems = gameDataObj.inventory.keyItems || '없음';
        
        gameDataObj.progress = gameDataObj.progress || {};
        gameDataObj.progress.playTime = gameDataObj.progress.playTime || "방금 시작";
        gameDataObj.progress.deathCount = gameDataObj.progress.deathCount || 0;
        
        return gameDataObj;
    }
    
    // ✅ 유지: 기본 게임 데이터
    getDefaultGameData() {
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
                current: "시작 지점",
                discovered: ["시작 지점"]
            },
            inventory: {
                items: [],
                gold: 0,
                keyItems: '없음'
            },
            progress: {
                playTime: "방금 시작",
                deathCount: 0,
                phase: "튜토리얼"
            }
        };
    }

    // ❌ 제거: createNewGame, saveGame, listGames, deleteGame
    // 이제 API에서 처리
}

module.exports = new GameService();
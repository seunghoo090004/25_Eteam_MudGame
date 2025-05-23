// routes/socket/handlers/game.js
//게임 상태 변경 이벤트 처리 (새 게임, 저장, 로드)


const gameService = require('../services/game');
const chatService = require('../services/chat');

const gameHandler = (io, socket) => {
    socket.on('new game', async (data) => {
        const LOG_HEADER_TITLE = "NEW_GAME";
        const LOG_HEADER = "UserId[" + socket.request.session.userId + "] AssistantId[" + data.assistant_id + "] --> " + LOG_HEADER_TITLE;
        const LOG_ERR_HEADER = "[FAIL]";
        const LOG_SUCC_HEADER = "[SUCC]";
        
        let ret_status = 200;
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
            if (!data.assistant_id) throw "Assistant ID required";
    
            const game = await gameService.createNewGame(userId, data.assistant_id);
            const initialResponse = await chatService.initializeChat(game.threadId, data.assistant_id);
            
            // 새 게임 생성 응답
            socket.emit('new game response', {
                success: true,
                game_id: game.gameId,
                game_data: game.gameData,
                initial_message: initialResponse
            });
    
            // 게임 목록 즉시 업데이트
            const updatedGames = await gameService.listGames(userId);
            socket.emit('games list response', {
                success: true,
                games: updatedGames
            });
    
            console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    
        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            socket.emit('new game response', {
                success: false,
                error: e.message || e
            });
        }
    });

    socket.on('load game', async (data) => {
        const LOG_HEADER_TITLE = "LOAD_GAME";
        const LOG_HEADER = "GameId[" + data.game_id + "] UserId[" + socket.request.session.userId + "] --> " + LOG_HEADER_TITLE;
        const LOG_ERR_HEADER = "[FAIL]";
        const LOG_SUCC_HEADER = "[SUCC]";
        
        let ret_status = 200;
        
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
            if (!data.game_id) throw "Game ID required";
    
            const gameData = await gameService.loadGame(data.game_id, userId);
    
            console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
            socket.emit('load game response', {
                success: true,
                game: gameData
            });
    
        } catch (e) {
            ret_status = 501;
            console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
            socket.emit('load game response', {
                success: false,
                error: e.message || e
            });
        }
    });

    socket.on('save game', async (data) => {
        const LOG_HEADER = "GAME/SAVE";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
            if (!data.game_id) throw "Game ID required";
            if (!data.game_data) throw "Game data required";

            await gameService.saveGame(data.game_id, userId, data.game_data);
            console.log(`[${LOG_HEADER}] Game saved`);
            socket.emit('save game response', {
                success: true
            });

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('save game response', {
                success: false,
                error: e.message || e
            });
        }
    });
    
    socket.on('get games list', async () => {
        const LOG_HEADER = "GAME/LIST";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
    
            const games = await gameService.listGames(userId);
            console.log(`[${LOG_HEADER}] Games list retrieved`);
            socket.emit('games list response', {
                success: true,
                games: games
            });
    
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('games list response', {
                success: false,
                error: e.message || e
            });
        }
    });

    socket.on('delete game', async (data) => {
        const LOG_HEADER = "GAME/DELETE";
        try {
            const userId = socket.request.session.userId;
            if (!userId) throw "Not authenticated";
            if (!data.game_id) throw "Game ID required";

            await gameService.deleteGame(data.game_id, userId);
            console.log(`[${LOG_HEADER}] Game deleted`);
            socket.emit('delete game response', {
                success: true,
                game_id: data.game_id
            });

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            socket.emit('delete game response', {
                success: false,
                error: e.message || e
            });
        }
    });
};

module.exports = gameHandler;
// routes/socket/services/game.js - updateGameState 메서드 추가

const pool = require('../../../config/database');

class GameService {
    async loadGameForSocket(gameId, userId) {
        const LOG_HEADER = "SOCKET_GAME_SERVICE/LOAD";
        
        try {
            const connection = await pool.getConnection();
            
            const [games] = await connection.query(
                'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
                [gameId, userId]
            );
            
            connection.release();
            
            if (games.length === 0) {
                throw new Error("Game not found or unauthorized");
            }
            
            console.log(`[${LOG_HEADER}] Game loaded for socket: ${gameId}`);
            return games[0];
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    async updateGameState(gameId, gameData) {
        const LOG_HEADER = "SOCKET_GAME_SERVICE/UPDATE";
        
        try {
            const connection = await pool.getConnection();
            
            await connection.query(
                'UPDATE game_state SET game_data = ?, last_updated = NOW() WHERE game_id = ?',
                [JSON.stringify(gameData), gameId]
            );
            
            connection.release();
            
            console.log(`[${LOG_HEADER}] Game state updated: ${gameId}`);
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new GameService();
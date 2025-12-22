/**
 * 게임 데이터 접근 계층
 * 모든 게임 관련 DB 쿼리는 이 클래스에서 관리
 */
const pool = require('../config/database');
const Logger = require('../lib/Logger');

class GameRepository {
    /**
     * 사용자의 현재 게임 조회
     * @param {number} userId
     * @returns {Promise<object|null>}
     */
    static async findCurrentByUserId(userId) {
        const connection = await pool.getConnection();
        try {
            const [games] = await connection.query(
                `SELECT * FROM games 
                 WHERE user_id = ? AND status = 'ACTIVE' 
                 ORDER BY created_at DESC LIMIT 1`,
                [userId]
            );
            return games.length > 0 ? games[0] : null;
        } catch (error) {
            Logger.error('GameRepository/findCurrentByUserId', 'Query failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 게임 ID로 게임 조회
     * @param {number} gameId
     * @returns {Promise<object|null>}
     */
    static async findById(gameId) {
        const connection = await pool.getConnection();
        try {
            const [games] = await connection.query(
                'SELECT * FROM games WHERE game_id = ?',
                [gameId]
            );
            return games.length > 0 ? games[0] : null;
        } catch (error) {
            Logger.error('GameRepository/findById', 'Query failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 게임 생성
     * @param {object} gameData
     * @returns {Promise<object>}
     */
    static async create(gameData) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                `INSERT INTO games (user_id, assistant_id, thread_id, game_data, status, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    gameData.userId,
                    gameData.assistantId,
                    gameData.threadId,
                    gameData.gameData || '{}',
                    gameData.status || 'ACTIVE'
                ]
            );

            Logger.info('GameRepository/create', 'Game created', {
                gameId: result.insertId,
                userId: gameData.userId
            });

            return {
                gameId: result.insertId,
                ...gameData
            };
        } catch (error) {
            Logger.error('GameRepository/create', 'Insert failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 게임 상태 업데이트
     * @param {number} gameId
     * @param {object} updateData
     * @returns {Promise<object>}
     */
    static async update(gameId, updateData) {
        const connection = await pool.getConnection();
        try {
            const fields = Object.keys(updateData)
                .map(key => `${key} = ?`)
                .join(', ');
            const values = [...Object.values(updateData), gameId];

            const [result] = await connection.query(
                `UPDATE games SET updated_at = NOW(), ${fields} WHERE game_id = ?`,
                values
            );

            Logger.info('GameRepository/update', 'Game updated', {
                gameId,
                fieldsUpdated: Object.keys(updateData)
            });

            return result;
        } catch (error) {
            Logger.error('GameRepository/update', 'Update failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 게임 종료
     * @param {number} gameId
     * @param {object} endingData
     * @returns {Promise<object>}
     */
    static async endGame(gameId, endingData) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                `UPDATE games SET status = 'ENDED', game_data = ?, updated_at = NOW() WHERE game_id = ?`,
                [JSON.stringify(endingData), gameId]
            );

            Logger.info('GameRepository/endGame', 'Game ended', { gameId });
            return result;
        } catch (error) {
            Logger.error('GameRepository/endGame', 'End game failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 사용자의 게임 히스토리 조회
     * @param {number} userId
     * @param {number} limit
     * @returns {Promise<array>}
     */
    static async findHistoryByUserId(userId, limit = 10) {
        const connection = await pool.getConnection();
        try {
            const [games] = await connection.query(
                `SELECT game_id, user_id, assistant_id, status, created_at, updated_at 
                 FROM games 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`,
                [userId, limit]
            );
            return games;
        } catch (error) {
            Logger.error('GameRepository/findHistoryByUserId', 'Query failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = GameRepository;

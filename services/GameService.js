/**
 * 게임 비즈니스 로직
 */
const GameRepository = require('../repositories/GameRepository');
const AppError = require('../lib/AppError');
const Logger = require('../lib/Logger');

class GameService {
    /**
     * 새 게임 생성
     * @param {object} gameData { userId, assistantId, threadId, gameData }
     * @returns {Promise<object>}
     */
    static async createGame(gameData) {
        const context = 'GameService/createGame';

        try {
            const newGame = await GameRepository.create({
                userId: gameData.userId,
                assistantId: gameData.assistantId,
                threadId: gameData.threadId,
                gameData: gameData.gameData || {},
                status: 'ACTIVE'
            });

            Logger.info(context, 'Game created', {
                gameId: newGame.gameId,
                userId: gameData.userId
            });

            return newGame;
        } catch (error) {
            Logger.error(context, 'Create game failed', error);
            throw AppError.internalError();
        }
    }

    /**
     * 현재 게임 조회
     * @param {number} userId
     * @returns {Promise<object|null>}
     */
    static async getCurrentGame(userId) {
        const context = 'GameService/getCurrentGame';

        try {
            const game = await GameRepository.findCurrentByUserId(userId);
            return game;
        } catch (error) {
            Logger.error(context, 'Get current game failed', error);
            throw AppError.internalError();
        }
    }

    /**
     * 게임 상태 업데이트
     * @param {number} gameId
     * @param {object} updateData
     * @returns {Promise<object>}
     */
    static async updateGame(gameId, updateData) {
        const context = 'GameService/updateGame';

        try {
            // 게임 존재 여부 확인
            const game = await GameRepository.findById(gameId);
            if (!game) {
                throw AppError.notFound('게임을 찾을 수 없습니다.');
            }

            const result = await GameRepository.update(gameId, updateData);

            Logger.info(context, 'Game updated', { gameId });
            return result;
        } catch (error) {
            if (error instanceof AppError) throw error;
            Logger.error(context, 'Update game failed', error);
            throw AppError.internalError();
        }
    }

    /**
     * 게임 종료
     * @param {number} gameId
     * @param {object} endingData
     * @returns {Promise<object>}
     */
    static async endGame(gameId, endingData) {
        const context = 'GameService/endGame';

        try {
            // 게임 존재 여부 확인
            const game = await GameRepository.findById(gameId);
            if (!game) {
                throw AppError.notFound('게임을 찾을 수 없습니다.');
            }

            const result = await GameRepository.endGame(gameId, endingData);

            Logger.info(context, 'Game ended', { gameId });
            return result;
        } catch (error) {
            if (error instanceof AppError) throw error;
            Logger.error(context, 'End game failed', error);
            throw AppError.internalError();
        }
    }

    /**
     * 게임 히스토리 조회
     * @param {number} userId
     * @param {number} limit
     * @returns {Promise<array>}
     */
    static async getGameHistory(userId, limit = 10) {
        const context = 'GameService/getGameHistory';

        try {
            const games = await GameRepository.findHistoryByUserId(userId, limit);
            return games;
        } catch (error) {
            Logger.error(context, 'Get game history failed', error);
            throw AppError.internalError();
        }
    }
}

module.exports = GameService;

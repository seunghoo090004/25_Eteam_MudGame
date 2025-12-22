/**
 * 사용자 데이터 접근 계층
 * 모든 사용자 관련 DB 쿼리는 이 클래스에서 관리
 */
const pool = require('../config/database');
const Logger = require('../lib/Logger');

class UserRepository {
    /**
     * ID로 사용자 조회
     * @param {number} userId
     * @returns {Promise<object|null>}
     */
    static async findById(userId) {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.query(
                `SELECT user_id, username, email, created_at 
                 FROM users WHERE user_id = ?`,
                [userId]
            );
            return users.length > 0 ? users[0] : null;
        } catch (error) {
            Logger.error('UserRepository/findById', 'Query failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 이메일로 사용자 조회
     * @param {string} email
     * @returns {Promise<object|null>}
     */
    static async findByEmail(email) {
        const connection = await pool.getConnection();
        try {
            const [users] = await connection.query(
                `SELECT user_id, username, email, password, created_at 
                 FROM users WHERE email = ? LIMIT 1`,
                [email]
            );
            return users.length > 0 ? users[0] : null;
        } catch (error) {
            Logger.error('UserRepository/findByEmail', 'Query failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 사용자 생성
     * @param {object} userData
     * @returns {Promise<object>}
     */
    static async create(userData) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                `INSERT INTO users (username, email, password, created_at) 
                 VALUES (?, ?, ?, NOW())`,
                [
                    userData.username,
                    userData.email,
                    userData.password
                ]
            );

            Logger.info('UserRepository/create', 'User created', {
                userId: result.insertId,
                email: userData.email
            });

            return {
                userId: result.insertId,
                ...userData
            };
        } catch (error) {
            Logger.error('UserRepository/create', 'Insert failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 사용자 정보 업데이트
     * @param {number} userId
     * @param {object} updateData
     * @returns {Promise<object>}
     */
    static async update(userId, updateData) {
        const connection = await pool.getConnection();
        try {
            const fields = Object.keys(updateData)
                .map(key => `${key} = ?`)
                .join(', ');
            const values = [...Object.values(updateData), userId];

            const [result] = await connection.query(
                `UPDATE users SET ${fields} WHERE user_id = ?`,
                values
            );

            Logger.info('UserRepository/update', 'User updated', {
                userId,
                fieldsUpdated: Object.keys(updateData)
            });

            return result;
        } catch (error) {
            Logger.error('UserRepository/update', 'Update failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 사용자 삭제
     * @param {number} userId
     * @returns {Promise<object>}
     */
    static async delete(userId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'DELETE FROM users WHERE user_id = ?',
                [userId]
            );

            Logger.info('UserRepository/delete', 'User deleted', { userId });
            return result;
        } catch (error) {
            Logger.error('UserRepository/delete', 'Delete failed', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 사용자 존재 확인
     * @param {string} email
     * @returns {Promise<boolean>}
     */
    static async exists(email) {
        const user = await this.findByEmail(email);
        return !!user;
    }
}

module.exports = UserRepository;

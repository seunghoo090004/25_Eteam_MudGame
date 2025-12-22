/**
 * 인증 비즈니스 로직
 * Repository와 외부 API를 조합하여 비즈니스 로직 구현
 */
const bcrypt = require('bcrypt');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../lib/AppError');
const Logger = require('../lib/Logger');

class AuthService {
    /**
     * 로그인
     * @param {string} email
     * @param {string} password
     * @returns {Promise<object>} 사용자 정보
     */
    static async login(email, password) {
        const context = 'AuthService/login';
        
        try {
            // 1. 사용자 조회
            const user = await UserRepository.findByEmail(email);
            if (!user) {
                Logger.warn(context, 'Login attempt with non-existent email', { email });
                throw AppError.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
            }

            // 2. 비밀번호 검증
            const isValidPassword = await bcrypt.compare(password, user.password);
            if (!isValidPassword) {
                Logger.warn(context, 'Login attempt with wrong password', { email });
                throw AppError.unauthorized('이메일 또는 비밀번호가 올바르지 않습니다.');
            }

            // 3. 로그인 성공
            Logger.info(context, 'User logged in', {
                userId: user.user_id,
                email
            });

            return {
                userId: user.user_id,
                username: user.username,
                email: user.email
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            Logger.error(context, 'Unexpected error', error);
            throw new AppError(500, '로그인 처리 중 오류가 발생했습니다.');
        }
    }

    /**
     * 회원가입
     * @param {object} signupData { email, password, username }
     * @returns {Promise<object>} 생성된 사용자 정보
     */
    static async signup(signupData) {
        const context = 'AuthService/signup';
        const { email, password, username } = signupData;

        try {
            // 1. 중복 이메일 확인
            const existingUser = await UserRepository.findByEmail(email);
            if (existingUser) {
                Logger.warn(context, 'Signup attempt with existing email', { email });
                throw AppError.conflict('이미 등록된 이메일입니다.');
            }

            // 2. 비밀번호 해싱
            const hashedPassword = await bcrypt.hash(password, 10);

            // 3. 사용자 생성
            const newUser = await UserRepository.create({
                email,
                username,
                password: hashedPassword
            });

            Logger.info(context, 'User registered', {
                userId: newUser.userId,
                email
            });

            return {
                userId: newUser.userId,
                username: newUser.username,
                email: newUser.email
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            Logger.error(context, 'Signup failed', error);
            throw new AppError(500, '회원가입 처리 중 오류가 발생했습니다.');
        }
    }

    /**
     * 비밀번호 변경
     * @param {number} userId
     * @param {string} currentPassword
     * @param {string} newPassword
     * @returns {Promise<boolean>}
     */
    static async changePassword(userId, currentPassword, newPassword) {
        const context = 'AuthService/changePassword';

        try {
            // 1. 사용자 조회
            const user = await UserRepository.findById(userId);
            if (!user) {
                throw AppError.notFound('사용자를 찾을 수 없습니다.');
            }

            // 2. 현재 비밀번호 검증
            const isValid = await bcrypt.compare(currentPassword, user.password);
            if (!isValid) {
                throw AppError.unauthorized('현재 비밀번호가 올바르지 않습니다.');
            }

            // 3. 새 비밀번호 해싱 및 업데이트
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await UserRepository.update(userId, { password: hashedPassword });

            Logger.info(context, 'Password changed', { userId });
            return true;
        } catch (error) {
            if (error instanceof AppError) throw error;
            Logger.error(context, 'Password change failed', error);
            throw new AppError(500, '비밀번호 변경 중 오류가 발생했습니다.');
        }
    }

    /**
     * 사용자 정보 조회
     * @param {number} userId
     * @returns {Promise<object>}
     */
    static async getUserInfo(userId) {
        const context = 'AuthService/getUserInfo';

        try {
            const user = await UserRepository.findById(userId);
            if (!user) {
                throw AppError.notFound('사용자를 찾을 수 없습니다.');
            }

            return {
                userId: user.user_id,
                username: user.username,
                email: user.email,
                createdAt: user.created_at
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            Logger.error(context, 'Get user info failed', error);
            throw new AppError(500, '사용자 정보 조회 중 오류가 발생했습니다.');
        }
    }
}

module.exports = AuthService;

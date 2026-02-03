// routes/auth/login.js
const express = require('express');
const router = express.Router();
//const csrf = require('csurf');
const jwt = require('jsonwebtoken'); // ✅ 추가
const JWT_SECRET = process.env.JWT_SECRET || 'asdas0azu0daswpqjklpmkofgjdoifjASDsdsdaw4682zHHlasd56'; // ✅ 추가

// 유틸리티 임포트
const asyncHandler = require('../../lib/asyncHandler');
const ApiResponse = require('../../lib/ApiResponse');
const AppError = require('../../lib/AppError');
const { validate, Validators } = require('../../lib/Validators');
const Logger = require('../../lib/Logger');
const AuthService = require('../../services/AuthService');
const pool = require('../../config/database');


// CSRF 보호 설정
//const csrfProtection = csrf({ cookie: true });

// 로그인 시도 로깅 함수
async function logLoginAttempt(email, ip, status, userId = null, errorReason = null) {
    try {
        const connection = await pool.getConnection();
        try {
            await connection.query(
                'INSERT INTO login_attempts (user_id, email, ip_address, status, error_reason, attempt_time) VALUES (?, ?, ?, ?, ?, NOW())',
                [userId, email, ip, status, errorReason]
            );
        } finally {
            connection.release();
        }
    } catch (error) {
        Logger.error('logLoginAttempt', 'Failed to log login attempt', error);
    }
}

// 로그인 시도 제한 미들웨어
const loginAttemptTracker = asyncHandler(async (req, res, next) => {
    const { email } = req.body;
    
    if (!email) {
        return next();
    }
    
    const connection = await pool.getConnection();
    
    try {
        // 최근 30분 내 실패한 로그인 시도 횟수 조회
        const [attempts] = await connection.query(
            'SELECT COUNT(*) as failCount FROM login_attempts WHERE email = ? AND status = "FAILED" AND attempt_time > DATE_SUB(NOW(), INTERVAL 30 MINUTE)',
            [email]
        );
        
        const failCount = attempts[0].failCount;
        
        // 5회 이상 실패 시 비밀번호 재설정 메시지 표시
        if (failCount >= 4) {
            Logger.warn('loginAttemptTracker', 'Too many login attempts', { email, failCount });
            return res.status(429).json(
                ApiResponse.error(429, '로그인 시도가 너무 많습니다. 비밀번호를 재설정해주세요.', 'TOO_MANY_ATTEMPTS')
            );
        }
        
        next();
    } catch (error) {
        Logger.error('loginAttemptTracker', 'Failed to check login attempts', error);
        next();
    } finally {
        connection.release();
    }
});

// ─────────────────────────────────────────────────────────
// GET /auth/login - 로그인 페이지 렌더링
// ─────────────────────────────────────────────────────────
/*router.get('/', csrfProtection, asyncHandler(async (req, res) => {
    const context = 'ROUTE/LOGIN/GET';
    
    if (req.session.userId) {
        Logger.debug(context, 'Already logged in, redirecting to home');
        return res.redirect('/');
    }
    
    res.render('login', { 
        csrfToken: req.csrfToken(),
        registered: req.query.registered === 'true'
    });
}));*/

// ─────────────────────────────────────────────────────────
// POST /auth/login - 로그인 처리 (JWT 토큰 추가 버전)
// ─────────────────────────────────────────────────────────
router.post('/', loginAttemptTracker, asyncHandler(async (req, res) => {
    const context = 'ROUTE/LOGIN/POST';
    const { email, password } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;

    Logger.debug(context, 'Login attempt', { email, ip: clientIP });

    // 1️⃣ 입력값 검증
    const validation = validate(
        { email, password },
        {
            email: Validators.email,
            password: Validators.required
        }
    );

    if (!validation.isValid) {
        Logger.warn(context, 'Validation failed', validation.errors);
        return res.status(400).json(
            ApiResponse.validationError(validation.errors)
        );
    }

    try {
        // 2️⃣ 비즈니스 로직 실행
        const user = await AuthService.login(email, password);

        // 3️⃣ 세션 설정
        req.session.userId = user.userId;
        req.session.username = user.username;

        // 세션 저장 대기
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // 4️⃣ JWT 토큰 생성 (Unity용)
        const token = jwt.sign(
            { 
                userId: user.userId, 
                username: user.username,
                email: user.email 
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );
        // 5️⃣ 로그인 성공 로깅
        await logLoginAttempt(email, clientIP, 'SUCCESS', user.userId);

        Logger.info(context, 'Login successful', {
            userId: user.userId,
            email
        });

        // 6️⃣  응답 (JWT 토큰 포함)
        res.json(
            ApiResponse.success(
                { userId: user.userId, username: user.username, email: user.email, token: token },
                '로그인이 완료되었습니다.'
            )
        );
    } catch (error) {
        // 실패 로깅
        if (error instanceof AppError && error.statusCode === 401) {
            await logLoginAttempt(email, clientIP, 'FAILED', null, 'INVALID_CREDENTIALS');
        }
        
        // 에러는 자동으로 다음 에러 핸들러로 전파됨
        if (error instanceof AppError) {
            Logger.warn(context, error.message, { email });
            throw error;
        }
        
        Logger.error(context, 'Unexpected error during login', error);
        throw new AppError(500, '로그인 처리 중 오류가 발생했습니다.');
    }
}));

module.exports = router;
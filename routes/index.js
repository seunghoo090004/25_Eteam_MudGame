// routes/index.js
// 메인 페이지 렌더링 및 라우트 설정

const express = require('express');
const router = express.Router();
const openai = require('../config/openai');
const pool = require('../config/database');

router.get('/', async(req, res) => {
    const LOG_HEADER = "ROUTE/MAIN";
    
    try {
        // 로그인 체크
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] No session, redirecting to login`);
            return res.redirect('/auth/login');
        }

        // 어시스턴트 목록 가져오기
        const assistants = await openai.beta.assistants.list();
        const assistantList = assistants.data.map(assistant => ({
            id: assistant.id,
            name: assistant.name
        }));
        
        // 사용자 이름 가져오기 (세션에 저장되어 있지 않은 경우)
        let username = req.session.username;
        
        if (!username) {
            // 데이터베이스에서 사용자 정보 조회
            const connection = await pool.getConnection();
            try {
                const [users] = await connection.query(
                    'SELECT username FROM users WHERE user_id = ?',
                    [req.session.userId]
                );
                
                if (users.length > 0) {
                    username = users[0].username;
                    // 세션에 사용자 이름 저장
                    req.session.username = username;
                }
            } finally {
                connection.release();
            }
        }

        console.log(`[${LOG_HEADER}] Page loaded successfully with ${assistantList.length} assistants`);
        
        return res.render('index', { 
            assistants: assistantList,
            userId: req.session.userId,
            username: username || '사용자' // 사용자 이름 전달 (기본값 설정)
        });

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return res.redirect('/auth/login');
    }
});

// 개별 엔딩 페이지 라우트
router.get('/ending/:game_id', async(req, res) => {
    const LOG_HEADER = "ROUTE/ENDING";
    
    try {
        // 로그인 체크
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] No session, redirecting to login`);
            return res.redirect('/auth/login');
        }

        const gameId = req.params.game_id;
        console.log(`[${LOG_HEADER}] Rendering ending page for game: ${gameId}`);
        
        return res.render('ending', {
            mode: 'single',
            gameId: gameId,
            userId: req.session.userId
        });

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return res.redirect('/');
    }
});

// 전체 엔딩 목록 페이지 라우트
router.get('/endings', async(req, res) => {
    const LOG_HEADER = "ROUTE/ENDINGS_LIST";
    
    try {
        // 로그인 체크
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] No session, redirecting to login`);
            return res.redirect('/auth/login');
        }

        console.log(`[${LOG_HEADER}] Rendering endings list page for user: ${req.session.userId}`);
        
        return res.render('ending', {
            mode: 'list',
            userId: req.session.userId,
            username: req.session.username || '사용자'
        });

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return res.redirect('/');
    }
});

//============================================================================================
// 상태 확인용 핑 엔드포인트
//============================================================================================
router.get('/ping', (req, res) => {
    const LOG_HEADER = "ROUTE/PING";
    console.log(`[${LOG_HEADER}] Health check`);
    res.status(200).json({ status: 'ok' });
});

//============================================================================================
// 에러 핸들러
//============================================================================================
router.use((err, req, res, next) => {
    const LOG_HEADER = "ROUTE/ERROR";
    console.error(`[${LOG_HEADER}] ${err.message || err}`);
    
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: req.app.get('env') === 'development' ? err : {}
    });
});

module.exports = router;
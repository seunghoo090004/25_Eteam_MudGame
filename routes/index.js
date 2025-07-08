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

//============================================================================================
// 엔딩 페이지 라우트
//============================================================================================
router.get('/ending/:game_id', async(req, res) => {
    const LOG_HEADER = "ROUTE/ENDING";
    
    try {
        // 로그인 체크
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] No session, redirecting to login`);
            return res.redirect('/auth/login');
        }

        const gameId = req.params.game_id;
        const userId = req.session.userId;

        if (!gameId) {
            console.log(`[${LOG_HEADER}] No game_id provided`);
            return res.redirect('/');
        }

        // 게임 엔딩 데이터 조회
        const connection = await pool.getConnection();
        try {
            // 게임 상태 확인
            const [games] = await connection.query(
                'SELECT * FROM game_state WHERE game_id = ? AND user_id = ? AND is_completed = TRUE',
                [gameId, userId]
            );

            if (games.length === 0) {
                console.log(`[${LOG_HEADER}] Game not found or not completed`);
                return res.redirect('/');
            }

            const gameData = games[0];

            // 엔딩 데이터 조회
            const [endings] = await connection.query(
                'SELECT * FROM game_endings WHERE game_id = ? AND user_id = ?',
                [gameId, userId]
            );

            let endingData;
            if (endings.length > 0) {
                // game_endings 테이블에서 데이터 가져오기
                endingData = endings[0];
            } else if (gameData.ending_data) {
                // game_state의 ending_data에서 가져오기 (fallback)
                endingData = JSON.parse(gameData.ending_data);
            } else {
                console.log(`[${LOG_HEADER}] No ending data found`);
                return res.redirect('/');
            }

            // 발견 정보 파싱 (game_data에서)
            let discoveries = [];
            try {
                const parsedGameData = JSON.parse(gameData.game_data);
                discoveries = parsedGameData.discoveries || [];
            } catch (e) {
                console.error(`[${LOG_HEADER}] Error parsing game_data:`, e);
            }

            // 엔딩 데이터 정규화
            const normalizedEnding = {
                ending_type: endingData.ending_type || 'death',
                final_turn: endingData.final_turn || 1,
                total_deaths: endingData.total_deaths || 0,
                discoveries_count: endingData.discoveries_count || discoveries.length,
                discoveries: discoveries,
                cause_of_death: endingData.cause_of_death || null,
                ending_story: endingData.ending_story || '모험이 끝났습니다.',
                time_elapsed: endingData.time_elapsed || 0,
                completed_at: endingData.created_at || gameData.last_updated
            };

            console.log(`[${LOG_HEADER}] Ending page loaded successfully for game: ${gameId}`);
            
            return res.render('ending', { 
                ending: normalizedEnding,
                userId: req.session.userId,
                username: req.session.username || '모험가',
                ai_response: null // 필요한 경우 마지막 AI 응답을 여기에 추가
            });

        } finally {
            connection.release();
        }

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return res.redirect('/');
    }
});

//============================================================================================
// 엔딩 목록 페이지 라우트
//============================================================================================
router.get('/endings', async(req, res) => {
    const LOG_HEADER = "ROUTE/ENDINGS_LIST";
    
    try {
        // 로그인 체크
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] No session, redirecting to login`);
            return res.redirect('/auth/login');
        }

        const userId = req.session.userId;

        // 사용자의 모든 엔딩 조회
        const connection = await pool.getConnection();
        try {
            const [endings] = await connection.query(`
                SELECT ge.*, gs.created_at as game_started, gs.game_mode
                FROM game_endings ge
                JOIN game_state gs ON ge.game_id = gs.game_id
                WHERE ge.user_id = ?
                ORDER BY ge.created_at DESC
                LIMIT 50
            `, [userId]);

            console.log(`[${LOG_HEADER}] Endings list loaded: ${endings.length} entries`);
            
            return res.render('endings-list', { 
                endings: endings,
                userId: req.session.userId,
                username: req.session.username || '모험가'
            });

        } finally {
            connection.release();
        }

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
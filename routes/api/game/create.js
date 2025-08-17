// routes/api/game/create.js - 16턴 시스템 초기 데이터

const express = require('express');
const router = express.Router();
const pool = require('../../../config/database');
const openai = require('../../../config/openai');
const { v4: uuidv4 } = require('uuid');
const reqinfo = require('../../../utils/reqinfo');

router.post('/', async (req, res) => {
    const LOG_HEADER = "API/GAME/CREATE";
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    const fail_status = 400;
    const catch_query = 1001;
    
    let ret_status = 200;
    let ret_data;
    let connection;
    
    const EXT_data = {
        req_url: reqinfo.get_req_url(req),
        user_id: reqinfo.maskId(req.session.userId)
    };

    // 인증 확인
    if (!req.session.userId) {
        ret_status = 401;
        ret_data = {
            code: "unauthorized",
            value: 0,
            value_ext1: ret_status,
            value_ext2: "로그인이 필요합니다.",
            EXT_data,
        };
        return res.status(ret_status).json(ret_data);
    }

    const req_user_id = req.session.userId;
    const req_assistant_id = req.body.assistant_id;
    const req_game_mode = req.body.game_mode || 'roguelike';

    if (!req_assistant_id) {
        ret_status = 400;
        ret_data = {
            code: "invalid_params",
            value: 0,
            value_ext1: ret_status,
            value_ext2: "Assistant ID가 필요합니다.",
            EXT_data,
        };
        return res.status(ret_status).json(ret_data);
    }

    try {
        connection = await pool.getConnection();

        // 기존 미완료 게임 삭제
        const [existingGames] = await connection.query(
            'SELECT * FROM game_state WHERE user_id = ? AND is_completed = 0',
            [req_user_id]
        );

        if (existingGames.length > 0) {
            console.log(`[${LOG_HEADER}] Deleting ${existingGames.length} existing incomplete games`);
            
            await connection.query(
                'DELETE FROM game_state WHERE user_id = ? AND is_completed = 0',
                [req_user_id]
            );

            // OpenAI 스레드 삭제 (비동기)
            existingGames.forEach(game => {
                if (game.thread_id) {
                    setTimeout(async () => {
                        try {
                            await openai.beta.threads.del(game.thread_id);
                            console.log(`[${LOG_HEADER}] Deleted existing thread: ${game.thread_id}`);
                        } catch (openaiError) {
                            console.error(`[${LOG_HEADER}] Failed to delete thread: ${game.thread_id}`, openaiError);
                        }
                    }, 100);
                }
            });
        }

        // 새 OpenAI 스레드 생성
        const thread = await openai.beta.threads.create();
        const thread_id = thread.id;
        
        // 16턴 시스템용 초기 게임 데이터
        const game_id = uuidv4();
        const initial_game_data = {
            turn_count: 1,
            death_count: 0,
            game_mode: req_game_mode,
            location: {
                current: "차원의 감옥 최하층"
            },
            discoveries: [],
            progress: {
                phase: "초급",
                survival_rate: 0.5,
                last_action: "게임 시작"
            },
            can_escape: false,
            max_turns: 16
        };

        await connection.query(
            `INSERT INTO game_state 
            (game_id, user_id, thread_id, assistant_id, game_data, game_mode, is_completed, created_at, last_updated) 
            VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW(), NOW())`,
            [game_id, req_user_id, thread_id, req_assistant_id, JSON.stringify(initial_game_data), req_game_mode]
        );

        console.log(`[${LOG_HEADER}] New 16-turn game created: ${game_id}`);

        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                game_id: game_id,
                thread_id: thread_id,
                game_data: initial_game_data
            },
            EXT_data,
        };

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(create_game)",
            value: catch_query,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    } finally {
        if (connection) connection.release();
    }

    if (ret_status != 200) {
        return res.status(ret_status).json(ret_data);
    }

    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
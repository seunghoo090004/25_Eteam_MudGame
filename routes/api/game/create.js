'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai');
const { v4: uuidv4 } = require('uuid');

//========================================================================
router.post('/', async(req, res) => 
//========================================================================
{
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    const EXT_data = my_reqinfo.get_req_url(req);
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_sqlconn = -2;
    const catch_openai = -3;
    const catch_query = -4;

    let req_user_id, req_assistant_id, req_game_mode;
    try {
        if (!req.session.userId) throw "user not authenticated";
        if (typeof req.body.assistant_id === 'undefined') throw "assistant_id undefined";
        
        req_user_id = req.session.userId;
        req_assistant_id = req.body.assistant_id;
        req_game_mode = req.body.game_mode || 'roguelike';
    } catch (e) {
        ret_status = fail_status + -1 * catch_body;
        ret_data = {
            code: "getBODY()",
            value: catch_body,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    }
    if (ret_status != 200)
        return res.status(ret_status).json(ret_data);

    let connection;
    try {
        connection = await pool.getConnection();
    } catch (e) {
        ret_status = fail_status + -1 * catch_sqlconn;
        ret_data = {
            code: "getConnection()",
            value: catch_sqlconn,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    }

    if (ret_status != 200)
        return res.status(ret_status).json(ret_data);

    try {
        // 기존 미완료 게임 삭제
        const [existingGames] = await connection.query(
            'SELECT game_id, thread_id FROM game_state WHERE user_id = ? AND is_completed = 0',
            [req_user_id]
        );

        if (existingGames.length > 0) {
            console.log(`[CREATE_GAME] Deleting ${existingGames.length} existing incomplete games`);
            
            // DB에서 게임 삭제
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
                            console.log(`[CREATE_GAME] Deleted existing thread: ${game.thread_id}`);
                        } catch (openaiError) {
                            console.error(`[CREATE_GAME] Failed to delete thread: ${game.thread_id}`, openaiError);
                        }
                    }, 100);
                }
            });
        }

        // 새 OpenAI 스레드 생성
        const thread = await openai.beta.threads.create();
        const thread_id = thread.id;
        
        // 새 게임 생성
        const game_id = uuidv4();
        const initial_game_data = {
            turn_count: 1,
            death_count: 0,
            game_mode: req_game_mode,
            location: {
                roomId: '001',
                current: "던전 최하층 감옥"
            },
            discoveries: [],
            progress: {
                phase: "시작",
                last_action: "게임 시작"
            }
        };

        await connection.query(
            `INSERT INTO game_state 
            (game_id, user_id, thread_id, assistant_id, game_data, game_mode, is_completed, created_at, last_updated) 
            VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW(), NOW())`,
            [game_id, req_user_id, thread_id, req_assistant_id, JSON.stringify(initial_game_data), req_game_mode]
        );

        console.log(`[CREATE_GAME] New game created: ${game_id}`);

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
        connection.release();
    }

    if (ret_status != 200) {
        return res.status(ret_status).json(ret_data);
    }

    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
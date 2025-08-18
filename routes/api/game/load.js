'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai');

//========================================================================
// GET /api/game/current - 현재 진행 중인 게임 조회
//========================================================================
router.get('/', async(req, res) => {
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    const EXT_data = my_reqinfo.get_req_url(req);
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_auth = -1;
    const catch_sqlconn = -2;
    const catch_query = -3;

    let req_user_id;
    try {
        if (!req.session || !req.session.userId) throw "user not authenticated";
        req_user_id = req.session.userId;
    } catch (e) {
        ret_status = 401;
        ret_data = {
            code: "auth_check",
            value: catch_auth,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
        return res.status(ret_status).json(ret_data);
    }

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
        return res.status(ret_status).json(ret_data);
    }

    let game_data;
    try {
        // 완료되지 않은 게임만 조회
        const [games] = await connection.query(
            'SELECT * FROM game_state WHERE user_id = ? AND is_completed = 0 ORDER BY last_updated DESC LIMIT 1',
            [req_user_id]
        );

        if (games.length === 0) {
            // 게임이 없을 때 404 응답
            ret_status = 404;
            ret_data = {
                code: "no_game_found",
                value: 0,
                value_ext1: ret_status,
                value_ext2: "불러올 수 있는 게임이 없습니다.",
                EXT_data,
            };
            console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
            return res.status(ret_status).json(ret_data);
        }

        game_data = games[0];
        
        if (!game_data.thread_id) {
            throw "Invalid thread ID";
        }

        // 게임 데이터 파싱
        let parsedGameData;
        try {
            parsedGameData = typeof game_data.game_data === 'string' 
                ? JSON.parse(game_data.game_data) 
                : game_data.game_data;
        } catch (parseError) {
            parsedGameData = {
                turn_count: 1,
                death_count: 0,
                game_mode: "roguelike",
                location: {
                    roomId: "001",
                    current: "던전 최하층 감옥"
                },
                discoveries: [],
                progress: {
                    phase: "시작",
                    last_action: "게임 시작"
                }
            };
        }

        game_data.game_data = parsedGameData;

        // 메시지 히스토리 가져오기
        let chat_history = [];
        try {
            const messages = await openai.beta.threads.messages.list(game_data.thread_id);
            chat_history = messages.data
                .filter(msg => {
                    const content = msg.content[0]?.text?.value || '';
                    return !content.includes('[로그라이크 게임 마스터 지침]') &&
                           !content.includes('[시스템 내부') &&
                           !content.includes('선택:') &&
                           msg.role === 'assistant';
                })
                .map(msg => ({
                    role: msg.role,
                    content: msg.content[0].text.value,
                    created_at: new Date(msg.created_at * 1000)
                }))
                .sort((a, b) => a.created_at - b.created_at);
        } catch (messageError) {
            console.error("Message history error:", messageError);
        }

        game_data.chatHistory = chat_history;

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(load_current_game)",
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

    ret_data = {
        code: "result",
        value: 1,
        value_ext1: ret_status,
        value_ext2: {
            game: game_data
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

//========================================================================
// DELETE /api/game/current - 현재 진행 중인 게임 삭제
//========================================================================
router.delete('/', async(req, res) => {
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    const EXT_data = my_reqinfo.get_req_url(req);
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_auth = -1;
    const catch_sqlconn = -2;
    const catch_query = -3;

    let req_user_id;
    try {
        if (!req.session || !req.session.userId) throw "user not authenticated";
        req_user_id = req.session.userId;
    } catch (e) {
        ret_status = 401;
        ret_data = {
            code: "auth_check",
            value: catch_auth,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
        return res.status(ret_status).json(ret_data);
    }

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
        return res.status(ret_status).json(ret_data);
    }

    let deleted_games = [];
    try {
        // 완료되지 않은 게임들 조회
        const [games] = await connection.query(
            'SELECT game_id, thread_id FROM game_state WHERE user_id = ? AND is_completed = 0',
            [req_user_id]
        );

        if (games.length > 0) {
            // 게임 삭제
            const [deleteResult] = await connection.query(
                'DELETE FROM game_state WHERE user_id = ? AND is_completed = 0',
                [req_user_id]
            );

            deleted_games = games;
            console.log(`[DELETE_CURRENT] Deleted ${deleteResult.affectedRows} incomplete games`);

            // OpenAI 스레드 삭제 (비동기)
            games.forEach(game => {
                if (game.thread_id) {
                    setTimeout(async () => {
                        try {
                            await openai.beta.threads.del(game.thread_id);
                            console.log(`[DELETE_CURRENT] OpenAI thread deleted: ${game.thread_id}`);
                        } catch (openaiError) {
                            console.error(`[DELETE_CURRENT] Failed to delete OpenAI thread: ${game.thread_id}`, openaiError);
                        }
                    }, 100);
                }
            });
        }

        // 게임이 없어도 성공으로 처리 (중복 삭제 방지)
        ret_data = {
            code: "result",
            value: deleted_games.length,
            value_ext1: ret_status,
            value_ext2: {
                deleted_games: deleted_games,
                message: deleted_games.length > 0 
                    ? `${deleted_games.length}개의 미완료 게임이 삭제되었습니다.`
                    : "삭제할 게임이 없습니다."
            },
            EXT_data,
        };

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(delete_current_games)",
            value: catch_query,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    } finally {
        connection.release();
    }

    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');

//========================================================================
// POST /api/game/ending - 엔딩 생성 및 기록
//========================================================================
router.post('/', async(req, res) => {
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    const EXT_data = my_reqinfo.get_req_url(req);
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_body = -1;
    const catch_sqlconn = -2;
    const catch_query = -3;

    let req_user_id, req_game_id, req_ending_data;
    try {
        if (!req.session.userId) throw "user not authenticated";
        if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
        if (typeof req.body.ending_data === 'undefined') throw "ending_data undefined";
        
        req_user_id = req.session.userId;
        req_game_id = req.body.game_id;
        req_ending_data = req.body.ending_data;
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
        // game_state 테이블 업데이트 (완료 상태로 변경)
        await connection.query(
            `UPDATE game_state 
            SET is_completed = TRUE, 
                ending_data = ?,
                last_updated = NOW()
            WHERE game_id = ? AND user_id = ?`,
            [JSON.stringify(req_ending_data), req_game_id, req_user_id]
        );

        // game_endings 테이블에 기록
        await connection.query(
            `INSERT INTO game_endings 
            (game_id, user_id, ending_type, final_turn, total_deaths, discoveries_count, ending_story)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                req_game_id,
                req_user_id,
                req_ending_data.ending_type,
                req_ending_data.final_turn || 1,
                req_ending_data.total_deaths || 0,
                req_ending_data.discoveries_count || 0,
                req_ending_data.ending_story || "게임이 종료되었습니다."
            ]
        );

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(create_ending)",
            value: catch_query,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
    }

    if (ret_status != 200) {
        connection.release();
        return res.status(ret_status).json(ret_data);
    }
    
    connection.release();
    ret_data = {
        code: "result",
        value: 1,
        value_ext1: ret_status,
        value_ext2: {
            game_id: req_game_id,
            ending_data: req_ending_data,
            message: "엔딩이 성공적으로 기록되었습니다."
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

//========================================================================
// GET /api/game/ending/:game_id - 엔딩 데이터 조회
//========================================================================
router.get('/:game_id', async(req, res) => {
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    const EXT_data = my_reqinfo.get_req_url(req);
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_auth = -1;
    const catch_sqlconn = -2;
    const catch_query = -3;

    let req_user_id, req_game_id;
    try {
        if (!req.session || !req.session.userId) throw "user not authenticated";
        if (!req.params.game_id) throw "game_id required";
        
        req_user_id = req.session.userId;
        req_game_id = req.params.game_id;
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

    let ending_data = null;
    try {
        // game_state에서 엔딩 데이터 조회
        const [games] = await connection.query(
            `SELECT gs.ending_data, gs.game_data, gs.created_at, gs.last_updated,
                    ge.ending_type, ge.final_turn, ge.total_deaths, 
                    ge.discoveries_count, ge.ending_story, ge.created_at as ending_created_at
            FROM game_state gs
            LEFT JOIN game_endings ge ON gs.game_id = ge.game_id
            WHERE gs.game_id = ? AND gs.user_id = ? AND gs.is_completed = TRUE`,
            [req_game_id, req_user_id]
        );

        if (games.length === 0) {
            throw "Ending not found or game not completed";
        }

        const game = games[0];
        ending_data = {
            game_id: req_game_id,
            ending_data: game.ending_data ? JSON.parse(game.ending_data) : null,
            game_data: game.game_data ? JSON.parse(game.game_data) : null,
            ending_type: game.ending_type,
            final_turn: game.final_turn,
            total_deaths: game.total_deaths,
            discoveries_count: game.discoveries_count,
            ending_story: game.ending_story,
            created_at: game.created_at,
            completed_at: game.ending_created_at || game.last_updated
        };

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(get_ending)",
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
            ending: ending_data
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

//========================================================================
// GET /api/game/endings - 사용자의 모든 엔딩 목록 조회
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

    let endings_list = [];
    try {
        const [endings] = await connection.query(
            `SELECT ge.*, gs.created_at as game_started
            FROM game_endings ge
            JOIN game_state gs ON ge.game_id = gs.game_id
            WHERE ge.user_id = ?
            ORDER BY ge.created_at DESC`,
            [req_user_id]
        );

        endings_list = endings.map(ending => ({
            id: ending.id,
            game_id: ending.game_id,
            ending_type: ending.ending_type,
            final_turn: ending.final_turn,
            total_deaths: ending.total_deaths,
            discoveries_count: ending.discoveries_count,
            ending_story: ending.ending_story,
            game_started: ending.game_started,
            completed_at: ending.created_at
        }));

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(get_endings_list)",
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
        value: endings_list.length,
        value_ext1: ret_status,
        value_ext2: {
            endings: endings_list
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

module.exports = router;
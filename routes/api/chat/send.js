// routes/api/chat/send.js - 16턴 시스템 업데이트

const express = require('express');
const router = express.Router();
const pool = require('../../../config/database');
const chatService = require('../../socket/services/chat');
const reqinfo = require('../../../utils/reqinfo');

router.post('/', async (req, res) => {
    const LOG_HEADER = "API/CHAT/SEND";
    const LOG_FAIL_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    const fail_status = 400;
    const catch_query = 1001;
    const catch_chat = 1002;
    
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
    const req_game_id = req.body.game_id;
    const req_message = req.body.message;

    if (!req_game_id || !req_message) {
        ret_status = 400;
        ret_data = {
            code: "invalid_params",
            value: 0,
            value_ext1: ret_status,
            value_ext2: "게임 ID와 메시지가 필요합니다.",
            EXT_data,
        };
        return res.status(ret_status).json(ret_data);
    }

    let game_data;
    let ai_response;
    let updated_game_data;

    // 게임 로드
    try {
        connection = await pool.getConnection();

        const [games] = await connection.query(
            'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
            [req_game_id, req_user_id]
        );

        if (games.length === 0) {
            throw "Game not found or unauthorized";
        }

        game_data = games[0];

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(load_game)",
            value: catch_query,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
        
        if (connection) connection.release();
        return res.status(ret_status).json(ret_data);
    }

    // AI 메시지 전송
    try {
        ai_response = await chatService.sendMessage(
            game_data.thread_id,
            game_data.assistant_id,
            req_message
        );

        // 게임 상태 파싱 및 업데이트
        const currentGameData = JSON.parse(game_data.game_data);
        const parsedState = await chatService.parseGameStateFromResponse(ai_response);
        
        updated_game_data = currentGameData;

        if (parsedState) {
            // 턴 수 업데이트
            if (parsedState.turn_count) {
                updated_game_data.turn_count = parsedState.turn_count;
            }

            // 위치 업데이트
            if (parsedState.location) {
                updated_game_data.location = parsedState.location;
            }

            // 발견사항 업데이트
            if (parsedState.discoveries) {
                updated_game_data.discoveries = parsedState.discoveries;
            }

            // 사망 처리
            if (parsedState.is_dead) {
                updated_game_data.death_count = (updated_game_data.death_count || 0) + 1;
                updated_game_data.death_cause = parsedState.death_cause;
            }

            // 16턴 시스템 체크
            if (updated_game_data.turn_count >= 16) {
                updated_game_data.can_escape = true;
            }
        }

        // DB 업데이트
        await connection.query(
            'UPDATE game_state SET game_data = ?, last_updated = NOW() WHERE game_id = ?',
            [JSON.stringify(updated_game_data), req_game_id]
        );

    } catch (e) {
        ret_status = fail_status + -1 * catch_chat;
        ret_data = {
            code: "chatService.sendMessage()",
            value: catch_chat,
            value_ext1: ret_status,
            value_ext2: e,
            EXT_data,
        };
        console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
        
        if (connection) connection.release();
        return res.status(ret_status).json(ret_data);
    }

    connection.release();
    
    ret_data = {
        code: "result",
        value: 1,
        value_ext1: ret_status,
        value_ext2: {
            response: ai_response,
            game_state: updated_game_data
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

module.exports = router;
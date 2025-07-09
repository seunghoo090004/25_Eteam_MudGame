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

        // game_endings 테이블에 완전한 정보 기록
        const gameSummary = generateGameSummary(req_ending_data);
        const locationInfo = req_ending_data.game_data?.location?.current || "알 수 없음";
        const playDuration = Math.floor((new Date() - new Date(req_ending_data.game_started || Date.now())) / (1000 * 60));
        
        await connection.query(
            `INSERT INTO game_endings 
            (game_id, user_id, ending_type, final_turn, total_deaths, discoveries_count, 
             ending_story, cause_of_death, game_summary, location_info, play_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req_game_id,
                req_user_id,
                req_ending_data.ending_type,
                req_ending_data.final_turn || 1,
                req_ending_data.total_deaths || 0,
                req_ending_data.discoveries_count || 0,
                req_ending_data.ending_story || "게임이 종료되었습니다.",
                req_ending_data.cause_of_death || null,
                gameSummary,
                locationInfo,
                playDuration
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
// GET /api/game/ending/:game_id - 엔딩 데이터 조회 (수정됨)
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
        
        console.log(`[ENDING_GET] Requested game_id: ${req_game_id}`);
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
        // 삭제된 게임 ID 처리 (deleted_ 접두사)
        const isDeletedGame = req_game_id.startsWith('deleted_');
        let queryGameId = req_game_id;
        
        if (isDeletedGame) {
            // deleted_16 -> 16번 엔딩 레코드 조회
            const endingId = req_game_id.replace('deleted_', '');
            console.log(`[ENDING_GET] Deleted game - searching by ending ID: ${endingId}`);
            
            const [endings] = await connection.query(
                `SELECT ge.*, 
                        NULL as ending_data, 
                        NULL as game_data, 
                        NULL as created_at, 
                        NULL as last_updated,
                        ge.created_at as ending_created_at
                FROM game_endings ge
                WHERE ge.id = ? AND ge.user_id = ?`,
                [endingId, req_user_id]
            );
            
            if (endings.length === 0) {
                throw "Ending data not found";
            }
            
            const endingRecord = endings[0];
            ending_data = {
                game_id: req_game_id,
                ending_type: endingRecord.ending_type,
                final_turn: endingRecord.final_turn,
                total_deaths: endingRecord.total_deaths,
                discoveries_count: endingRecord.discoveries_count,
                ending_story: endingRecord.ending_story,
                cause_of_death: endingRecord.cause_of_death,
                game_summary: endingRecord.game_summary,
                location_info: endingRecord.location_info,
                play_duration: endingRecord.play_duration,
                completed_at: endingRecord.ending_created_at,
                is_deleted_game: true
            };
        } else {
            // 일반 게임 - 기존 로직
            console.log(`[ENDING_GET] Active game - searching by game_id: ${req_game_id}`);
            
            const [games] = await connection.query(
                `SELECT gs.ending_data, gs.game_data, gs.created_at, gs.last_updated,
                        ge.ending_type, ge.final_turn, ge.total_deaths, 
                        ge.discoveries_count, ge.ending_story, ge.cause_of_death,
                        ge.game_summary, ge.location_info, ge.play_duration,
                        ge.created_at as ending_created_at
                FROM game_state gs
                LEFT JOIN game_endings ge ON gs.game_id = ge.game_id
                WHERE gs.game_id = ? AND gs.user_id = ? AND gs.is_completed = 1`,
                [req_game_id, req_user_id]
            );

            if (games.length === 0) {
                throw "Ending data not found";
            }

            const gameData = games[0];
            
            let parsedEndingData = {};
            if (gameData.ending_data) {
                if (typeof gameData.ending_data === 'string') {
                    try {
                        parsedEndingData = JSON.parse(gameData.ending_data);
                    } catch (parseError) {
                        console.error("Error parsing ending_data string:", parseError);
                        parsedEndingData = {};
                    }
                } else if (typeof gameData.ending_data === 'object') {
                    parsedEndingData = gameData.ending_data;
                }
            }

            let parsedGameData = null;
            if (gameData.game_data) {
                if (typeof gameData.game_data === 'string') {
                    try {
                        parsedGameData = JSON.parse(gameData.game_data);
                    } catch (parseError) {
                        console.error("Error parsing game_data string:", parseError);
                        parsedGameData = null;
                    }
                } else if (typeof gameData.game_data === 'object') {
                    parsedGameData = gameData.game_data;
                }
            }

            ending_data = {
                game_id: req_game_id,
                ...parsedEndingData,
                game_data: parsedGameData,
                created_at: gameData.created_at,
                completed_at: gameData.ending_created_at || gameData.last_updated,
                is_deleted_game: false
            };
        }

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(get_ending)",
            value: catch_query,
            value_ext1: ret_status,
            value_ext2: e.toString(),
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
        value_ext2: ending_data,
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

//========================================================================
// GET /api/game/ending - 사용자의 모든 엔딩 목록 조회
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
            `SELECT ge.*, COALESCE(ge.game_id, CONCAT('deleted_', ge.id)) as display_id
            FROM game_endings ge
            WHERE ge.user_id = ?
            ORDER BY ge.created_at DESC`,
            [req_user_id]
        );

        endings_list = endings.map(ending => ({
            id: ending.id,
            game_id: ending.display_id,
            ending_type: ending.ending_type,
            final_turn: ending.final_turn,
            total_deaths: ending.total_deaths,
            discoveries_count: ending.discoveries_count,
            ending_story: ending.ending_story,
            game_summary: ending.game_summary,
            location_info: ending.location_info,
            play_duration: ending.play_duration,
            completed_at: ending.created_at,
            is_deleted: !ending.game_id
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

// 게임 요약 생성 함수
function generateGameSummary(endingData) {
    const turn = endingData.final_turn || 0;
    const deaths = endingData.total_deaths || 0;
    const discoveries = endingData.discoveries_count || 0;
    
    let summary = `${turn}턴 동안 진행된 로그라이크 던전 탈출 게임`;
    
    if (deaths === 0) {
        summary += " - 완벽한 플레이로 한 번도 죽지 않고 도전";
    } else if (deaths <= 2) {
        summary += ` - ${deaths}번의 죽음을 딛고 도전`;
    } else {
        summary += ` - ${deaths}번의 죽음을 통해 경험을 쌓으며 도전`;
    }
    
    if (discoveries > 0) {
        summary += `. ${discoveries}개의 정보를 발견하며 던전의 비밀에 다가감`;
    } else {
        summary += ". 위험한 던전에서 생존에만 집중";
    }
    
    if (endingData.ending_type === 'death') {
        if (turn <= 3) {
            summary += ". 초반 함정의 위험성을 몸소 체험";
        } else if (turn <= 6) {
            summary += ". 중반까지의 생존력을 보였으나 던전의 위험을 극복하지 못함";
        } else {
            summary += ". 후반까지 생존한 놀라운 적응력을 보임";
        }
    } else if (endingData.ending_type === 'escape') {
        summary += ". 불가능에 가까운 던전 탈출에 성공한 전설적인 모험";
    }
    
    return summary + ".";
}

module.exports = router;
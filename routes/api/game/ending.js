'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai');

//========================================================================
// POST /api/game/ending - 엔딩 생성 및 기록 (게임 상태 자동 삭제)
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

    let thread_id_to_delete = null;
    try {
        // 현재 사용자의 총 사망 횟수 계산
        const [deathCount] = await connection.query(
            'SELECT COUNT(*) as count FROM game_endings WHERE user_id = ? AND ending_type = "death"',
            [req_user_id]
        );
        
        const currentDeathCount = deathCount[0].count;
        const totalDeaths = req_ending_data.ending_type === 'death' ? currentDeathCount + 1 : currentDeathCount;
        
        req_ending_data.total_deaths = totalDeaths;

        // 게임 상태에서 thread_id 가져오기
        const [gameState] = await connection.query(
            'SELECT thread_id FROM game_state WHERE game_id = ? AND user_id = ?',
            [req_game_id, req_user_id]
        );

        if (gameState.length > 0) {
            thread_id_to_delete = gameState[0].thread_id;
        }

        // 트랜잭션 시작
        await connection.beginTransaction();

        // game_endings 테이블에 엔딩 기록
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
                totalDeaths,
                0,
                req_ending_data.ending_story || "게임이 종료되었습니다.",
                req_ending_data.cause_of_death || null,
                gameSummary,
                locationInfo,
                playDuration
            ]
        );

        // 게임 상태 삭제 (엔딩 처리 후 자동 삭제)
        await connection.query(
            'DELETE FROM game_state WHERE game_id = ? AND user_id = ?',
            [req_game_id, req_user_id]
        );

        await connection.commit();
        console.log(`[ENDING_CREATE] Game ${req_game_id} ended and deleted`);

    } catch (e) {
        if (connection) {
            await connection.rollback();
        }
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(create_ending)",
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

    // OpenAI 스레드 삭제 (비동기)
    if (thread_id_to_delete) {
        setTimeout(async () => {
            try {
                await openai.beta.threads.del(thread_id_to_delete);
                console.log(`[ENDING_CREATE] OpenAI thread deleted: ${thread_id_to_delete}`);
            } catch (openaiError) {
                console.error(`[ENDING_CREATE] Failed to delete OpenAI thread: ${thread_id_to_delete}`, openaiError);
            }
        }, 100);
    }
    
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
        const isDeletedGame = req_game_id.startsWith('deleted_');
        
        if (isDeletedGame) {
            const endingId = req_game_id.replace('deleted_', '');
            
            const [endings] = await connection.query(
                `SELECT ge.*, ge.created_at as ending_created_at
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
                discoveries_count: 0,
                ending_story: endingRecord.ending_story,
                cause_of_death: endingRecord.cause_of_death,
                game_summary: endingRecord.game_summary,
                location_info: endingRecord.location_info,
                play_duration: endingRecord.play_duration,
                completed_at: endingRecord.ending_created_at,
                is_deleted_game: true
            };
        } else {
            const [endings] = await connection.query(
                `SELECT ge.*, ge.created_at as ending_created_at
                FROM game_endings ge
                WHERE ge.game_id = ? AND ge.user_id = ?`,
                [req_game_id, req_user_id]
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
                discoveries_count: 0,
                ending_story: endingRecord.ending_story,
                cause_of_death: endingRecord.cause_of_death,
                game_summary: endingRecord.game_summary,
                location_info: endingRecord.location_info,
                play_duration: endingRecord.play_duration,
                completed_at: endingRecord.ending_created_at,
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

    let req_user_id, page, limit;
    try {
        if (!req.session || !req.session.userId) throw "user not authenticated";
        req_user_id = req.session.userId;
        
        page = parseInt(req.query.page) || 1;
        limit = parseInt(req.query.limit) || 5;
        
        if (page < 1) page = 1;
        if (limit < 1 || limit > 50) limit = 5;
        
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
    let total_count = 0;
    try {
        const [countResult] = await connection.query(
            `SELECT COUNT(*) as total FROM game_endings WHERE user_id = ?`,
            [req_user_id]
        );
        total_count = countResult[0].total;
        
        const offset = (page - 1) * limit;
        const [endings] = await connection.query(
            `SELECT ge.*, COALESCE(ge.game_id, CONCAT('deleted_', ge.id)) as display_id
            FROM game_endings ge
            WHERE ge.user_id = ?
            ORDER BY ge.created_at DESC
            LIMIT ? OFFSET ?`,
            [req_user_id, limit, offset]
        );

        endings_list = endings.map((ending, index) => ({
            id: ending.id,
            game_id: ending.display_id,
            ending_type: ending.ending_type,
            final_turn: ending.final_turn,
            total_deaths: ending.total_deaths,
            discoveries_count: 0,
            ending_story: ending.ending_story,
            game_summary: ending.game_summary,
            location_info: ending.location_info,
            play_duration: ending.play_duration,
            completed_at: ending.created_at,
            is_deleted: !ending.game_id,
            game_number: total_count - offset - index
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
    
    const total_pages = Math.ceil(total_count / limit);
    const has_prev = page > 1;
    const has_next = page < total_pages;
    
    ret_data = {
        code: "result",
        value: endings_list.length,
        value_ext1: ret_status,
        value_ext2: {
            endings: endings_list,
            pagination: {
                current_page: page,
                total_pages: total_pages,
                total_count: total_count,
                limit: limit,
                has_prev: has_prev,
                has_next: has_next
            }
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});


function generateGameSummary(endingData) {
    const turn = endingData.final_turn || 0;
    const deaths = endingData.total_deaths || 0;
    
    let summary = `${turn}턴 동안 진행된 로그라이크 던전 탈출 게임`;
    
    if (deaths === 0) {
        summary += " - 완벽한 플레이로 한 번도 죽지 않고 도전";
    } else if (deaths <= 2) {
        summary += ` - ${deaths}번의 죽음을 딛고 도전`;
    } else {
        summary += ` - ${deaths}번의 죽음을 통해 경험을 쌓으며 도전`;
    }
    
    summary += ". 위험한 던전에서 생존에만 집중";
    
    if (endingData.ending_type === 'death') {
        if (turn <= 3) {
            summary += ". 초급 단계에서 함정의 위험성을 몸소 체험";
        } else if (turn <= 7) {
            summary += ". 중급 단계까지의 생존력을 보였으나 던전의 위험을 극복하지 못함";
        } else if (turn <= 12) {
            summary += ". 고급 단계까지 생존한 놀라운 적응력을 보임";
        } else if (turn <= 16) {
            summary += ". 최종 단계에 도달한 뛰어난 생존 전략을 구사했으나 아쉽게 실패";
        } else {
            summary += ". 탈출 구간에서 사망했습니다. 거의 성공에 가까웠던 안타까운 결과";
        }
    } else if (endingData.ending_type === 'escape') {
        summary += ". 불가능에 가까운 던전 탈출에 성공한 전설적인 모험";
    }
    
    return summary + ".";
}

module.exports = router;
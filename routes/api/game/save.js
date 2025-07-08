// routes/api/game/save.js - 엔딩 시스템 포함 버전

'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai');

router.post('/', async(req, res) => {
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

    let req_user_id, req_game_id, req_game_data, req_ending_trigger;
    try {
        if (!req.session.userId) throw "user not authenticated";
        if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
        if (typeof req.body.game_data === 'undefined') throw "game_data undefined";
        
        req_user_id = req.session.userId;
        req_game_id = req.body.game_id;
        req_game_data = req.body.game_data;
        req_ending_trigger = req.body.ending_trigger || null; // 엔딩 트리거 정보
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

    let old_game_data;
    try {
        const [games] = await connection.query(
            'SELECT * FROM game_state WHERE game_id = ? AND user_id = ?',
            [req_game_id, req_user_id]
        );
        
        if (games.length === 0) {
            throw "Game not found or unauthorized";
        }
        
        old_game_data = games[0];
    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(load_game_for_save)",
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

    // 엔딩 조건 체크
    let ending_data = null;
    let is_completed = false;
    
    if (req_ending_trigger) {
        is_completed = true;
        ending_data = {
            ending_type: req_ending_trigger.type, // 'death', 'escape', 'quit'
            final_turn: req_game_data.turn_count || 0,
            total_deaths: req_game_data.death_count || 0,
            discoveries: req_game_data.discoveries || [],
            discoveries_count: (req_game_data.discoveries || []).length,
            cause_of_death: req_ending_trigger.cause || null,
            ending_story: req_ending_trigger.story || "게임이 종료되었습니다.",
            completed_at: new Date().toISOString()
        };
    }

    // 요약 생성 및 새 스레드 생성 (진행 중인 게임만)
    let summary = "게임이 저장되었습니다.";
    let new_thread_id = old_game_data.thread_id;
    let initial_response = "게임을 이어서 진행합니다.";
    
    if (!is_completed) {
        try {
            // 로그라이크 게임용 요약 생성
            await openai.beta.threads.messages.create(old_game_data.thread_id, {
                role: "user",
                content: `### 로그라이크 던전 게임 세션 요약

현재 턴: ${req_game_data.turn_count}
사망 횟수: ${req_game_data.death_count}
현재 위치: ${req_game_data.location?.current || "알 수 없음"}
발견한 정보: ${(req_game_data.discoveries || []).join(", ") || "없음"}

이 정보를 바탕으로 새 스레드에서 게임을 이어갈 수 있도록 간략한 요약을 작성하세요.
플레이어의 현재 상황과 지금까지의 경험을 반영하여 150단어 이내로 요약해주세요.`
            });

            const run = await openai.beta.threads.runs.create(old_game_data.thread_id, {
                assistant_id: old_game_data.assistant_id
            });

            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 2000));
                runStatus = await openai.beta.threads.runs.retrieve(old_game_data.thread_id, run.id);
            } while (['queued', 'in_progress'].includes(runStatus.status));

            if (runStatus.status === 'completed') {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const messages = await openai.beta.threads.messages.list(old_game_data.thread_id);
                
                if (messages.data && messages.data.length > 0) {
                    summary = messages.data[0].content[0].text.value;
                }
            }

            // 새 스레드 생성
            const newThread = await openai.beta.threads.create();
            new_thread_id = newThread.id;

            // 로그라이크 게임 재개 초기화
            await openai.beta.threads.messages.create(new_thread_id, {
                role: "user",
                content: `[시스템 내부 - 로그라이크 게임 재개]

게임 요약: ${summary}

현재 턴: ${req_game_data.turn_count}
사망 횟수: ${req_game_data.death_count}

위 정보를 바탕으로 로그라이크 던전 게임을 이어서 진행하되, 요약 내용을 사용자에게 표시하지 마세요.`
            });

            await openai.beta.threads.messages.create(new_thread_id, {
                role: "user",
                content: `***로그라이크 던전 게임 재개***

**응답 형식 필수 준수:**

[던전 상황 설명]

STATS
===============================================
Turn: ${req_game_data.turn_count}
Location: [위치 정보]
Time: [경과 시간]
Discoveries: [발견한 정보]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

**중요 규칙:**
- 체력 시스템 없음 (즉사 or 생존)
- 턴 ${req_game_data.turn_count}부터 계속
- 잘못된 선택 시 즉시 사망
- 11턴 이후 탈출 기회 제공

게임을 이어서 진행하세요.`
            });

            // 초기 응답 생성
            const newRun = await openai.beta.threads.runs.create(new_thread_id, {
                assistant_id: old_game_data.assistant_id
            });

            let newRunStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 2000));
                newRunStatus = await openai.beta.threads.runs.retrieve(new_thread_id, newRun.id);
            } while (['queued', 'in_progress'].includes(newRunStatus.status));

            if (newRunStatus.status === 'completed') {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const newMessages = await openai.beta.threads.messages.list(new_thread_id);
                
                if (newMessages.data && newMessages.data.length > 0) {
                    initial_response = newMessages.data[0].content[0].text.value;
                }
            }

            // 이전 스레드 삭제
            openai.beta.threads.del(old_game_data.thread_id)
                .then(() => console.log("Old thread deleted:", old_game_data.thread_id))
                .catch(e => console.error("Error deleting old thread:", e));

        } catch (e) {
            console.error("OpenAI summary error:", e);
        }
    }

    // 게임 데이터 저장
    let normalized_game_data;
    try {
        normalized_game_data = normalizeGameData(req_game_data);
        const gameDataToSave = JSON.stringify(normalized_game_data);
        
        const [updateResult] = await connection.query(
            `UPDATE game_state 
            SET thread_id = ?,
                game_data = ?,
                is_completed = ?,
                ending_data = ?,
                last_updated = NOW()
            WHERE game_id = ? AND user_id = ?`,
            [new_thread_id, gameDataToSave, is_completed, ending_data ? JSON.stringify(ending_data) : null, req_game_id, req_user_id]
        );
        
        if (updateResult.affectedRows === 0) {
            throw "Game update failed";
        }

        // 엔딩 발생 시 game_endings 테이블에도 기록
        if (is_completed && ending_data) {
            await connection.query(
                `INSERT INTO game_endings 
                (game_id, user_id, ending_type, final_turn, total_deaths, discoveries_count, ending_story)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    req_game_id,
                    req_user_id,
                    ending_data.ending_type,
                    ending_data.final_turn,
                    ending_data.total_deaths,
                    ending_data.discoveries_count,
                    ending_data.ending_story
                ]
            );
        }

    } catch (e) {
        ret_status = fail_status + -1 * catch_query;
        ret_data = {
            code: "query(save_game)",
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
            new_thread_id: new_thread_id,
            summary: summary,
            initial_response: is_completed ? null : initial_response,
            game_data: normalized_game_data,
            is_completed: is_completed,
            ending_data: ending_data
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

// 로그라이크 게임 데이터 정규화
function normalizeGameData(gameData) {
    let gameDataObj;
    
    try {
        gameDataObj = typeof gameData === 'string' ? JSON.parse(gameData) : gameData;
    } catch (err) {
        gameDataObj = getDefaultGameData();
    }
    
    // 로그라이크 필수 필드
    gameDataObj.turn_count = gameDataObj.turn_count || 1;
    gameDataObj.death_count = gameDataObj.death_count || 0;
    gameDataObj.game_mode = gameDataObj.game_mode || 'roguelike';
    
    gameDataObj.location = gameDataObj.location || {};
    gameDataObj.location.current = gameDataObj.location.current || "던전 입구";
    gameDataObj.location.roomId = gameDataObj.location.roomId || "001";
    
    gameDataObj.discoveries = gameDataObj.discoveries || [];
    
    gameDataObj.progress = gameDataObj.progress || {};
    gameDataObj.progress.phase = gameDataObj.progress.phase || "시작";
    gameDataObj.progress.last_action = gameDataObj.progress.last_action || "게임 시작";
    
    return gameDataObj;
}

function getDefaultGameData() {
    return {
        turn_count: 1,
        death_count: 0,
        game_mode: "roguelike",
        location: {
            roomId: "001",
            current: "던전 입구"
        },
        discoveries: [],
        progress: {
            phase: "시작",
            last_action: "게임 시작"
        }
    };
}

module.exports = router;
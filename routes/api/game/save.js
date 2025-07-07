// routes/api/game/save.js - 요약 생성 시 형식 통일

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

    let req_user_id, req_game_id, req_game_data;
    try {
        if (!req.session.userId) throw "user not authenticated";
        if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
        if (typeof req.body.game_data === 'undefined') throw "game_data undefined";
        
        req_user_id = req.session.userId;
        req_game_id = req.body.game_id;
        req_game_data = req.body.game_data;
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

    // ✅ 수정: 형식 통일된 요약 생성 및 새 스레드 생성
    let summary = "게임이 저장되었습니다.";
    let new_thread_id = old_game_data.thread_id;
    let initial_response = "게임을 이어서 진행합니다.";
    
    try {
        // ✅ 수정: 형식 통일된 게임 요약 생성
        await openai.beta.threads.messages.create(old_game_data.thread_id, {
            role: "user",
            content: `### 게임 세션 요약 생성 (내부 시스템용)

이 게임 세션을 새 스레드에 이어갈 수 있도록 핵심 정보만 간략히 요약해주세요.
이 요약은 사용자에게 표시되지 않으며, 새 스레드에서 게임 재개용으로만 사용됩니다.

**요약 형식:**
캐릭터: [레벨, 체력, 상태, 정신상태]
위치: [현재 방ID, 방이름, 던전 층수]
진행: [주요 행동, 마지막 상황]
소지품: [핵심 아이템, 골드]
발견사항: [중요한 발견, 상호작용]

**중요:** 
- 150단어 이내로 간결하게 작성
- 게임 연속성에 필요한 정보만 포함
- 사용자에게 표시되지 않는 내부 자료임을 인지

요약을 생성하세요.`
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

        // ✅ 수정: 형식 통일된 게임 재개 초기화
        await openai.beta.threads.messages.create(new_thread_id, {
            role: "user",
            content: `[시스템 내부 - 게임 재개 정보]

게임 요약:
${summary}

위 정보를 바탕으로 게임을 이어서 진행하되, 이 요약 내용을 사용자에게 표시하지 마세요.`
        });

        await openai.beta.threads.messages.create(new_thread_id, {
            role: "user",
            content: `***게임 재개 - 형식 필수 준수***

**반드시 이 형식으로만 응답:**

===============================================
         던전 탈출 - [층수]
===============================================

>> 위치: [3자리 ID] - [방 이름]

[현재 상황 설명]

STATS ===============================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [시간]
위치: [층 정보]

경고: [경고사항]
===============================================

↑ [간단한 행동]
↓ [간단한 행동]
← [간단한 행동]
→ [간단한 행동]

**절대 금지:**
- [위치: 1|...] 다른 형식 사용
- 선택지에 (위험: ...) 부가설명
- [상태: ...] 다른 형식
- 요약 내용 사용자 표시

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

        // 이전 스레드 삭제 (비동기)
        openai.beta.threads.del(old_game_data.thread_id)
            .then(() => console.log("Old thread deleted:", old_game_data.thread_id))
            .catch(e => console.error("Error deleting old thread:", e));

    } catch (e) {
        console.error("OpenAI summary error:", e);
        // 오류 시 기본값 사용
    }

    // 게임 데이터 저장
    let normalized_game_data;
    try {
        normalized_game_data = normalizeGameData(req_game_data);
        
        const now = new Date();
        const created = new Date(old_game_data.created_at);
        const playTimeMinutes = Math.floor((now - created) / (1000 * 60));
        normalized_game_data.progress.playTime = formatPlayTime(playTimeMinutes);

        const gameDataToSave = JSON.stringify(normalized_game_data);
        
        const [updateResult] = await connection.query(
            `UPDATE game_state 
            SET thread_id = ?,
                game_data = ?,
                last_updated = NOW()
            WHERE game_id = ? AND user_id = ?`,
            [new_thread_id, gameDataToSave, req_game_id, req_user_id]
        );
        
        if (updateResult.affectedRows === 0) {
            throw "Game update failed";
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
            initial_response: initial_response,
            game_data: normalized_game_data
        },
        EXT_data,
    };
    console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

    return res.status(ret_status).json(ret_data);
});

// 나머지 함수들은 기존과 동일
function normalizeGameData(gameData) {
    let gameDataObj;
    
    try {
        gameDataObj = typeof gameData === 'string' ? JSON.parse(gameData) : gameData;
    } catch (err) {
        gameDataObj = getDefaultGameData();
    }
    
    gameDataObj.player = gameDataObj.player || {};
    gameDataObj.player.health = gameDataObj.player.health || 100;
    gameDataObj.player.maxHealth = gameDataObj.player.maxHealth || 100;
    gameDataObj.player.status = gameDataObj.player.status || '양호';
    gameDataObj.player.mental = gameDataObj.player.mental || '안정';
    
    gameDataObj.location = gameDataObj.location || {};
    gameDataObj.location.current = gameDataObj.location.current || "알 수 없는 곳";
    gameDataObj.location.roomId = gameDataObj.location.roomId || "001";
    
    gameDataObj.inventory = gameDataObj.inventory || {};
    gameDataObj.inventory.items = gameDataObj.inventory.items || [];
    gameDataObj.inventory.gold = gameDataObj.inventory.gold || 0;
    gameDataObj.inventory.keyItems = gameDataObj.inventory.keyItems || '없음';
    
    gameDataObj.progress = gameDataObj.progress || {};
    gameDataObj.progress.playTime = gameDataObj.progress.playTime || "방금 시작";
    gameDataObj.progress.deathCount = gameDataObj.progress.deathCount || 0;
    
    return gameDataObj;
}

function getDefaultGameData() {
    return {
        player: {
            name: "플레이어",
            level: 1,
            health: 100,
            maxHealth: 100,
            status: '양호',
            mental: '안정'
        },
        location: {
            roomId: "001",
            current: "시작 지점",
            discovered: ["시작 지점"]
        },
        inventory: {
            items: [],
            gold: 0,
            keyItems: '없음'
        },
        progress: {
            playTime: "방금 시작",
            deathCount: 0,
            phase: "튜토리얼"
        }
    };
}

function formatPlayTime(minutes) {
    if (minutes < 1) return "방금 시작";
    if (minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

module.exports = router;
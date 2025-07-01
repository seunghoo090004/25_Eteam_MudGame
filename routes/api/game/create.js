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

  //----------------------------------------------------------------------
  // getBODY
  //----------------------------------------------------------------------
  let req_user_id, req_assistant_id;
  try {
    if (!req.session.userId) throw "user not authenticated";
    if (typeof req.body.assistant_id === 'undefined') throw "assistant_id undefined";
    
    req_user_id = req.session.userId;
    req_assistant_id = req.body.assistant_id;
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

  //----------------------------------------------------------------------
  // OpenAI Thread 생성
  //----------------------------------------------------------------------
  let thread_id;
  try {
    const thread = await openai.beta.threads.create();
    thread_id = thread.id;
  } catch (e) {
    ret_status = fail_status + -1 * catch_openai;
    ret_data = {
      code: "openai.threads.create()",
      value: catch_openai,
      value_ext1: ret_status,
      value_ext2: e,
      EXT_data,
    };
    console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
  }
  if (ret_status != 200)
    return res.status(ret_status).json(ret_data);

  //----------------------------------------------------------------------
  // getConnection 
  //----------------------------------------------------------------------
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

  //----------------------------------------------------------------------
  // 게임 데이터 생성 및 저장
  //----------------------------------------------------------------------
  let game_id, initial_game_data;
  try {
    game_id = uuidv4();
    
    initial_game_data = {
      player: {
        name: "플레이어",
        level: 1,
        exp: 0,
        health: 100,
        maxHealth: 100,
        effects: '없음',
        mental: '안정',
        status: '양호'
      },
      location: {
        roomId: '001',
        roomName: '던전 최하층 감옥',
        level: 1,
        maxLevel: 5,
        current: "던전 최하층 감옥",
        discovered: ["던전 최하층 감옥"]
      },
      inventory: {
        keyItems: '횃불(2)',
        items: ['횃불(2)'],
        gold: 0
      },
      progress: {
        deathCount: 0,
        discoveries: '없음',
        puzzlesSolved: 0,
        phase: "탈출",
        playTime: "방금 시작",
        lastAction: "게임 시작",
        flags: {
          tutorialComplete: false,
          metNPC: false
        }
      }
    };

    await connection.query(
      `INSERT INTO game_state 
      (game_id, user_id, thread_id, assistant_id, game_data, created_at, last_updated) 
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [game_id, req_user_id, thread_id, req_assistant_id, JSON.stringify(initial_game_data)]
    );

  } catch (e) {
    ret_status = fail_status + -1 * catch_query;
    ret_data = {
      code: "query(insert_game)",
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
  
  //----------------------------------------------------------------------
  // result
  //----------------------------------------------------------------------
  connection.release();
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
  console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

  return res.status(ret_status).json(ret_data);
});

module.exports = router;
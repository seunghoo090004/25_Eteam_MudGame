'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const { authenticateUser } = require('../../../middleware/auth');
//const chatService = require('../../socket/services/chat'); // 기존 경로


//========================================================================
router.post('/', authenticateUser,async(req, res) => 
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
  const catch_query = -3;
  const catch_chat = -4;

  //----------------------------------------------------------------------
  // getBODY
  //----------------------------------------------------------------------
  let req_user_id, req_game_id;
  try {
    //if (!req.session.userId) throw "user not authenticated"; 기존 방버
    req_user_id = req.session.userId;

    if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
    req_game_id = req.body.game_id;
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
  // Query execution - 게임 정보 조회
  //----------------------------------------------------------------------
  let game_data;
  try {
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
  }

  if (ret_status != 200) {
    connection.release();
    return res.status(ret_status).json(ret_data);
  }

  //----------------------------------------------------------------------
  // 채팅 히스토리 조회 -> OpenAI Thread에서 메시지 가져오기
  //----------------------------------------------------------------------
  let chat_history;
  try {
    const messages = await openai.beta.threads.messages.list(game_data.thread_id);
    
    chat_history = messages.data
      .filter(msg => msg.role === 'assistant')
      .map(msg => ({
        role: msg.role,
        content: msg.content[0].text.value,
        created_at: new Date(msg.created_at * 1000)
      }))
      .sort((a, b) => a.created_at - b.created_at);

  } catch (e) {
    ret_status = fail_status + -1 * catch_chat;
    ret_data = {
      code: "openai_history",
      value: catch_chat,
      value_ext1: ret_status,
      value_ext2: e.message || e,
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
    value: chat_history.length,
    value_ext1: ret_status,
    value_ext2: {
      history: chat_history
    },
    EXT_data,
  };
  console.log(LOG_SUCC_HEADER + ` History count: ${chat_history.length}`);

  return res.status(ret_status).json(ret_data);
});

module.exports = router;
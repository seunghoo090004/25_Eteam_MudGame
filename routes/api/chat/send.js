'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const chatService = require('../../socket/services/chat');

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
  const catch_query = -3;
  const catch_chat = -4;

  //----------------------------------------------------------------------
  // getBODY
  //----------------------------------------------------------------------
  let req_user_id, req_game_id, req_message;
  try {
    if (!req.session.userId) throw "user not authenticated";
    if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
    if (typeof req.body.message === 'undefined') throw "message undefined";
    
    req_user_id = req.session.userId;
    req_game_id = req.body.game_id;
    req_message = req.body.message;
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
  // 채팅 서비스 호출
  //----------------------------------------------------------------------
  let ai_response, updated_game_data;
  try {
    // AI 응답 받기
    ai_response = await chatService.sendMessage(
      game_data.thread_id,
      game_data.assistant_id,
      req_message
    );

    // 게임 상태 파싱 및 업데이트
    let currentGameData = JSON.parse(JSON.stringify(game_data.game_data));
    if (typeof currentGameData === 'string') {
      currentGameData = JSON.parse(currentGameData);
    }

    const parsedState = chatService.parseGameResponse(ai_response);
    
    if (parsedState) {
      // 위치 정보 업데이트
      if (parsedState.location && parsedState.location.current) {
        currentGameData.location.current = parsedState.location.current;
        
        if (parsedState.location.roomId) {
          currentGameData.location.roomId = parsedState.location.roomId;
        }
        
        if (!currentGameData.location.discovered.includes(parsedState.location.current)) {
          currentGameData.location.discovered.push(parsedState.location.current);
        }
      }
      
      // 플레이어 상태 업데이트
      if (parsedState.player) {
        Object.keys(parsedState.player).forEach(key => {
          if (parsedState.player[key] !== undefined) {
            currentGameData.player[key] = parsedState.player[key];
          }
        });
      }
      
      // 인벤토리 업데이트
      if (parsedState.inventory) {
        Object.keys(parsedState.inventory).forEach(key => {
          if (parsedState.inventory[key] !== undefined) {
            currentGameData.inventory[key] = parsedState.inventory[key];
          }
        });
      }
    }

    updated_game_data = currentGameData;

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
      response: ai_response,
      game_state: updated_game_data
    },
    EXT_data,
  };
  console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

  return res.status(ret_status).json(ret_data);
});

module.exports = router;
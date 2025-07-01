'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai');

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
  const catch_openai = -4;

  //----------------------------------------------------------------------
  // getBODY
  //----------------------------------------------------------------------
  let req_user_id, req_game_id;
  try {
    if (!req.session.userId) throw "user not authenticated";
    if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
    
    req_user_id = req.session.userId;
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
  // Query execution - 게임 로드
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
        player: { health: 100, maxHealth: 100, status: '양호' },
        location: { current: "알 수 없음" },
        inventory: { keyItems: '없음' },
        progress: { playTime: "방금 시작", deathCount: 0 }
      };
    }

    // 플레이 시간 업데이트
    const now = new Date();
    const created = new Date(game_data.created_at);
    const playTimeMinutes = Math.floor((now - created) / (1000 * 60));
    parsedGameData.progress.playTime = formatPlayTime(playTimeMinutes);

    game_data.game_data = parsedGameData;

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
  // OpenAI 메시지 히스토리 가져오기
  //----------------------------------------------------------------------
  let chat_history = [];
  try {
    const messages = await openai.beta.threads.messages.list(game_data.thread_id);
    chat_history = messages.data.map(msg => {
      let content = "메시지 내용을 불러올 수 없습니다.";
      try {
        if (msg.content && msg.content.length > 0 && msg.content[0].text) {
          content = msg.content[0].text.value;
        }
      } catch (contentError) {
        console.error("Message content error:", contentError);
      }
      
      return {
        role: msg.role,
        content: content,
        created_at: new Date(msg.created_at * 1000)
      };
    });
  } catch (e) {
    console.error("Error fetching chat history:", e);
    // 히스토리 가져오기 실패는 치명적이지 않음
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
      game: {
        ...game_data,
        chatHistory: chat_history
      }
    },
    EXT_data,
  };
  console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

  return res.status(ret_status).json(ret_data);
});

// 플레이 시간 포맷팅 유틸리티
function formatPlayTime(minutes) {
  if (minutes < 1) return "방금 시작";
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

module.exports = router;
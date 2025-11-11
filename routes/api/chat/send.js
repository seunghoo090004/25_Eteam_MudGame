'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai'); // ✅ 추가
const chatService = require('../../socket/services/chat');

//신혁이가 수정
// ✅ 이미지 생성 함수들 임포트
const { 
    generateImageFromText, 
    extractImageKeywords, 
    createImagePrompt 
} = require('../../../utils/gptUtils');

//========================================================================
router.post('/', async(req, res) => 
//========================================================================
{
  const LOG_FAIL_HEADER = "[FAIL]";
  const LOG_SUCC_HEADER = "[SUCC]";
  const LOG_HEADER = "[CHAT_SEND]"; // 신혁이가 추가
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
  // ✅ Thread 초기화 확인 (Postman 지원용)
  //----------------------------------------------------------------------
  try {
    const messages = await openai.beta.threads.messages.list(game_data.thread_id);
    if (messages.data.length === 0) {
      console.log('[CHAT_SEND] Thread empty, initializing...');
      await chatService.initializeChat(game_data.thread_id, game_data.assistant_id);
    }
  } catch (initError) {
    console.error('[CHAT_SEND] Initialization check error:', initError);
    // 초기화 실패 시에도 계속 진행 (기존 메시지가 있을 수 있음)
  }

  //----------------------------------------------------------------------
  // 채팅 서비스 호출
  //----------------------------------------------------------------------
  let ai_response, updated_game_data;
  try {
    ai_response = await chatService.sendMessage(
      game_data.thread_id,
      game_data.assistant_id,
      req_message
    );

    // 게임 데이터 파싱
    let currentGameData;
    try {
      currentGameData = typeof game_data.game_data === 'string' 
        ? JSON.parse(game_data.game_data) 
        : game_data.game_data;
    } catch (parseError) {
      console.error('[CHAT_SEND] Game data parse error:', parseError);
      currentGameData = game_data.game_data;
    }

    // 응답에서 게임 상태 파싱
    const parsedState = chatService.parseGameResponse(ai_response);

    // 게임 데이터 업데이트
    if (parsedState) {
      if (parsedState.turn_count !== undefined) {
        currentGameData.turn_count = parsedState.turn_count;
      }
      if (parsedState.location) {
        currentGameData.location = {
          ...currentGameData.location,
          ...parsedState.location
        };
      }
      if (parsedState.discoveries) {
        currentGameData.discoveries = parsedState.discoveries;
      }
      if (parsedState.inventory) {
        currentGameData.inventory = currentGameData.inventory || {};
        Object.keys(parsedState.inventory).forEach(key => {
          if (parsedState.inventory[key] !== undefined) {
            currentGameData.inventory[key] = parsedState.inventory[key];
          }
        });
      }
      // 사망 처리
       if (parsedState.is_death === true) {
         currentGameData.is_death = true;
         currentGameData.is_completed = true;
        if (parsedState.death_cause) {
      currentGameData.death_cause = parsedState.death_cause;
       }
      }
  
       // 탈출 성공 처리
       if (parsedState.is_escape === true) {
        currentGameData.is_completed = true;
        currentGameData.is_escape = true;
        currentGameData.is_death = false;
      }
  
      // death_count 업데이트
      if (parsedState.death_count !== undefined) {
       currentGameData.death_count = parsedState.death_count;
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
  // image create logic
  //----------------------------------------------------------------------
   let imageData = null;
  
  try {
    console.log(`${LOG_HEADER} ===== 이미지 생성 프로세스 시작 =====`);
    
    // 게임 컨텍스트 준비
    const gameContext = {
      turn_count: updated_game_data.turn_count || 1,
      location: updated_game_data.location,
      game_state: updated_game_data
    };
    
    console.log(`${LOG_HEADER} Game context:`, {
      turn: gameContext.turn_count,
      location: gameContext.location?.current
    });
    
    // 씬 설명 추출
    const sceneInfo = extractImageKeywords(ai_response, gameContext);
    console.log(`${LOG_HEADER} Scene extraction:`, {
      shouldGenerate: sceneInfo.shouldGenerate,
      descriptionLength: sceneInfo.sceneDescription?.length || 0
    });
    
    if (sceneInfo.shouldGenerate) {
      console.log(`${LOG_HEADER} 이미지 프롬프트 생성 중...`);
      
      // 이미지 프롬프트 생성
      const imagePrompt = createImagePrompt(sceneInfo, gameContext);
      console.log(`${LOG_HEADER} Image prompt: ${imagePrompt.substring(0, 100)}...`);
      
      console.log(`${LOG_HEADER} OpenAI 이미지 생성 API 호출 시작...`);
      const startTime = Date.now();
      
      // 이미지 생성 (비동기)
      const imageResult = await generateImageFromText(imagePrompt, {
        quality: process.env.IMAGE_GENERATION_QUALITY || 'low',
        size: '1024x1024'
      });
      
      const generationTime = Date.now() - startTime;
      
      console.log(`${LOG_HEADER} 이미지 생성 결과 (${generationTime}ms):`, {
        success: imageResult.success,
        error: imageResult.error || 'none',
        error_type: imageResult.error_type || 'none',
        hasBase64: !!imageResult.image_base64,
        base64Length: imageResult.image_base64?.length || 0
      });
      
      if (imageResult.success) {
        console.log(`${LOG_HEADER} ✅ 이미지 생성 성공!`);
        imageData = imageResult;
      } else {
        console.log(`${LOG_HEADER} ⚠️ 이미지 생성 실패: ${imageResult.error}`);
        imageData = {
          success: false,
          error: imageResult.error || 'Image generation failed',
          error_type: imageResult.error_type || 'unknown'
        };
      }
      
    } else {
      console.log(`${LOG_HEADER} 이미지 생성 조건 미충족 - 스킵`);
      imageData = {
        success: false,
        error: 'Scene not suitable for image generation',
        error_type: 'skipped'
      };
    }
    
    console.log(`${LOG_HEADER} ===== 이미지 생성 프로세스 완료 =====`);
    
  } catch (imageError) {
    console.error(`${LOG_HEADER} ❌ 이미지 생성 중 예외 발생:`, imageError.message);
    console.error(imageError.stack);
    imageData = {
      success: false,
      error: imageError.message || 'Unexpected error',
      error_type: 'exception'
    };
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
      game_state: updated_game_data,
      image_data: imageData,  // <- 이미지 추가
      is_completed: updated_game_data.is_completed || false,  // 탈출 성공
      is_death: updated_game_data.is_death || false,          // 탈출 실팽(죽음)
      death_cause: updated_game_data.death_cause || null,     // 죽은 횟수?사건
    },
    EXT_data,
  };
  console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

  return res.status(ret_status).json(ret_data);
});

module.exports = router;
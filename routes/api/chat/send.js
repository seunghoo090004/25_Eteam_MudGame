'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../../utils/apiReqinfo');
const pool = require('../../../config/database');
const openai = require('../../../config/openai'); // ✅ 추가
const { authenticateUser } = require('../../../middleware/auth'); //인증 미들웨어 추가
//const chatService = require('../../socket/services/chat'); // 기존 경로

//신혁이가 수정
// ✅ 이미지 생성 함수들 임포트
let generateImageFromText, extractImageKeywords, createImagePrompt;
try {
  const gptUtils = require('../../../utils/gptUtils');
  generateImageFromText = gptUtils.generateImageFromText;
  extractImageKeywords = gptUtils.extractImageKeywords;
  createImagePrompt = gptUtils.createImagePrompt;
} catch (error) {
  console.warn('[CHAT_SEND] gptUtils 로드 실패 - 이미지 생성 비활성화:', error.message);
  generateImageFromText = null;
}
//========================================================================
router.post('/', authenticateUser, async(req, res) => 
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
    // authenticateUser 미들웨어가 req.session.userId를 설정함
    req_user_id = req.session.userId;
    //if (!req.session.userId) throw "user not authenticated"; 기존 방법
    if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
    if (typeof req.body.message === 'undefined') throw "message undefined";
    
    //req_user_id = req.session.userId; 기존 방법
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
  // 채팅 서비스 호출 -> OpenAI API 직접 호출
  //----------------------------------------------------------------------
  let ai_response, updated_game_data;
  try {
    console.log(`${LOG_HEADER} OpenAI API 호출 시작...`);
    
    // Thread 초기화 확인
    const messages = await openai.beta.threads.messages.list(game_data.thread_id);
    
    if (messages.data.length === 0) {
      console.log(`${LOG_HEADER} Thread 초기화 중...`);
      
      await openai.beta.threads.messages.create(game_data.thread_id, {
        role: "user",
        content: "게임을 시작합니다."
      });
      
      const run = await openai.beta.threads.runs.create(game_data.thread_id, {
        assistant_id: game_data.assistant_id
      });
      
      let runStatus = await openai.beta.threads.runs.retrieve(game_data.thread_id, run.id);
      let attempts = 0;
      
      while (runStatus.status !== 'completed' && attempts < 60) {
        if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
          throw new Error(`Run failed: ${runStatus.status}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        runStatus = await openai.beta.threads.runs.retrieve(game_data.thread_id, run.id);
        attempts++;
      }
      
      if (attempts >= 60) {
        throw new Error('Thread initialization timeout');
      }
    }
    
    // 사용자 메시지 전송
    await openai.beta.threads.messages.create(game_data.thread_id, {
      role: "user",
      content: req_message
    });
    
    console.log(`${LOG_HEADER} Run 실행 중...`);
    
    // Run 실행
    const run = await openai.beta.threads.runs.create(game_data.thread_id, {
      assistant_id: game_data.assistant_id
    });
    
    // Run 완료 대기
    let runStatus = await openai.beta.threads.runs.retrieve(game_data.thread_id, run.id);
    let attempts = 0;
    
    while (runStatus.status !== 'completed' && attempts < 180) {
      if (runStatus.status === 'failed' || runStatus.status === 'cancelled') {
        throw new Error(`Run failed: ${runStatus.status}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(game_data.thread_id, run.id);
      attempts++;
      
      if (attempts % 10 === 0) {
        console.log(`${LOG_HEADER} Run 상태: ${runStatus.status} (${attempts}/180)`);
      }
    }
    
    if (attempts >= 180) {
      throw new Error('OpenAI response timeout');
    }
    
    // 응답 메시지 가져오기
    const responseMessages = await openai.beta.threads.messages.list(game_data.thread_id);
    const lastMessage = responseMessages.data[0];
    ai_response = lastMessage.content[0].text.value;
    
    console.log(`${LOG_HEADER} AI 응답 수신 완료 (길이: ${ai_response.length})`);

    // 게임 데이터 파싱
    let currentGameData;
    try {
      currentGameData = typeof game_data.game_data === 'string' 
        ? JSON.parse(game_data.game_data) 
        : game_data.game_data;
    } catch (parseError) {
      console.error(`${LOG_HEADER} Game data parse error:`, parseError);
      currentGameData = game_data.game_data || {};
    }

    // 응답에서 게임 상태 파싱
    const parsedState = parseGameResponse(ai_response);

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
      
      if (parsedState.is_death === true) {
        currentGameData.is_death = true;
        currentGameData.is_completed = true;
        if (parsedState.death_cause) {
          currentGameData.death_cause = parsedState.death_cause;
        }
      }
  
      if (parsedState.is_escape === true) {
        currentGameData.is_completed = true;
        currentGameData.is_escape = true;
        currentGameData.is_death = false;
      }
  
      if (parsedState.death_count !== undefined) {
        currentGameData.death_count = parsedState.death_count;
      }
    }

    updated_game_data = currentGameData;

  } catch (e) {
    ret_status = fail_status + -1 * catch_chat;
    ret_data = {
      code: "openai_chat",
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
  // image create logic -> 수정
  //----------------------------------------------------------------------
  let imageData = null;
  
  if (!generateImageFromText || !extractImageKeywords || !createImagePrompt) {
    console.log(`${LOG_HEADER} 이미지 생성 함수 없음 - 스킵`);
    imageData = {
      success: false,
      error: 'Image generation not available',
      error_type: 'disabled'
    };
  } else {
    try {
      console.log(`${LOG_HEADER} ===== 이미지 생성 프로세스 시작 =====`);
      
      const gameContext = {
        turn_count: updated_game_data.turn_count || 1,
        location: updated_game_data.location,
        game_state: updated_game_data
      };
      
      const sceneInfo = extractImageKeywords(ai_response, gameContext);
      
      if (sceneInfo.shouldGenerate) {
        const imagePrompt = createImagePrompt(sceneInfo, gameContext);
        const startTime = Date.now();
        
        const imageResult = await generateImageFromText(imagePrompt, {
          quality: process.env.IMAGE_GENERATION_QUALITY || 'standard',
          size: '1024x1024'
        });
        
        const generationTime = Date.now() - startTime;
        console.log(`${LOG_HEADER} 이미지 생성 결과 (${generationTime}ms):`, {
          success: imageResult.success
        });
        
        imageData = imageResult.success ? imageResult : {
          success: false,
          error: imageResult.error || 'Image generation failed',
          error_type: imageResult.error_type || 'unknown'
        };
        
      } else {
        imageData = {
          success: false,
          error: 'Scene not suitable for image generation',
          error_type: 'skipped'
        };
      }
      
      console.log(`${LOG_HEADER} ===== 이미지 생성 프로세스 완료 =====`);
      
    } catch (imageError) {
      console.error(`${LOG_HEADER} ❌ 이미지 생성 중 예외:`, imageError.message);
      imageData = {
        success: false,
        error: imageError.message || 'Unexpected error',
        error_type: 'exception'
      };
    }
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

// 게임 응답 파싱 함수
function parseGameResponse(response) {
  if (!response) return null;
  
  const gameState = {
    turn_count: null,
    location: { current: null },
    discoveries: [],
    is_death: false
  };
  
  try {
    if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
      gameState.is_death = true;
      
      const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                      response.match(/([^.\n]+)로 인해 죽었습니다/i);
      if (deathMatch) {
        gameState.death_cause = deathMatch[1].trim();
      }
    }
    
    const statsPattern = /통계[^=]*={3,}([\s\S]*?)={3,}/;
    const statsMatch = response.match(statsPattern);
    
    if (statsMatch) {
      const statsContent = statsMatch[1];
      
      const turnPattern = /턴[:\s]*(\d+)/;
      const turnMatch = statsContent.match(turnPattern);
      if (turnMatch) {
        gameState.turn_count = parseInt(turnMatch[1]);
      }
      
      const locationPattern = /위치[:\s]*([^\n]+)/;
      const locationMatch = statsContent.match(locationPattern);
      if (locationMatch) {
        gameState.location.current = locationMatch[1].trim();
      }
      
      const discoveryPattern = /발견[:\s]*([^\n]+)/;
      const discoveryMatch = statsContent.match(discoveryPattern);
      if (discoveryMatch) {
        const discoveryText = discoveryMatch[1].trim();
        if (discoveryText !== '없음' && discoveryText !== 'None' && discoveryText !== '') {
          gameState.discoveries = discoveryText.split(',').map(d => d.trim()).filter(d => d);
        }
      }
    }
    
    return gameState;
    
  } catch (e) {
    console.error('[CHAT_SEND] Stats parsing error:', e);
    return null;
  }
}
module.exports = router;
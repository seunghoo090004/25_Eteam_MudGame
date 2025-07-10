// 'use strict';
// const express = require('express');
// const router = express.Router();
// const my_reqinfo = require('../../../utils/apiReqinfo');
// const pool = require('../../../config/database');
// const openai = require('../../../config/openai');

// //========================================================================
// router.post('/', async(req, res) => 
// //========================================================================
// {
//   const LOG_FAIL_HEADER = "[FAIL]";
//   const LOG_SUCC_HEADER = "[SUCC]";
//   const EXT_data = my_reqinfo.get_req_url(req);
  
//   const fail_status = 500;
//   let ret_status = 200;
//   let ret_data;

//   const catch_body = -1;
//   const catch_sqlconn = -2;
//   const catch_query = -3;
//   const catch_openai = -4;

//   //----------------------------------------------------------------------
//   // getBODY
//   //----------------------------------------------------------------------
//   let req_user_id, req_game_id;
//   try {
//     if (!req.session.userId) throw "user not authenticated";
//     if (typeof req.body.game_id === 'undefined') throw "game_id undefined";
    
//     req_user_id = req.session.userId;
//     req_game_id = req.body.game_id;
    
//     console.log(`[DELETE_GAME] User: ${req_user_id}, Game: ${req_game_id}`);
//   } catch (e) {
//     ret_status = fail_status + -1 * catch_body;
//     ret_data = {
//       code: "getBODY()",
//       value: catch_body,
//       value_ext1: ret_status,
//       value_ext2: e,
//       EXT_data,
//     };
//     console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
//   }
//   if (ret_status != 200)
//     return res.status(ret_status).json(ret_data);

//   //----------------------------------------------------------------------
//   // getConnection 
//   //----------------------------------------------------------------------
//   let connection;
//   try {
//     connection = await pool.getConnection();
//   } catch (e) {
//     ret_status = fail_status + -1 * catch_sqlconn;
//     ret_data = {
//       code: "getConnection()",
//       value: catch_sqlconn,
//       value_ext1: ret_status,
//       value_ext2: e,
//       EXT_data,
//     };
//     console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
//   }

//   if (ret_status != 200)
//     return res.status(ret_status).json(ret_data);

//   //----------------------------------------------------------------------
//   // Query execution - Thread ID 조회 및 게임 삭제
//   //----------------------------------------------------------------------
//   let thread_id_to_delete = null;
//   let deleted_game_data = null;
  
//   try {
//     // 먼저 게임 소유권 확인 및 정보 조회
//     const [gameCheck] = await connection.query(
//       'SELECT game_id, thread_id, game_data FROM game_state WHERE game_id = ? AND user_id = ?',
//       [req_game_id, req_user_id]
//     );

//     if (gameCheck.length === 0) {
//       throw "Game not found or unauthorized access";
//     }

//     thread_id_to_delete = gameCheck[0].thread_id;
//     deleted_game_data = gameCheck[0];
    
//     console.log(`[DELETE_GAME] Found game - Thread: ${thread_id_to_delete}`);

//     // 트랜잭션 시작
//     await connection.beginTransaction();

//     try {
//       // game_endings에서는 game_id를 NULL로 설정 (기록 보존)
//       await connection.query(
//         'UPDATE game_endings SET game_id = NULL WHERE game_id = ? AND user_id = ?',
//         [req_game_id, req_user_id]
//       );
      
//       console.log(`[DELETE_GAME] Updated game_endings to preserve records`);

//       // game_state 테이블에서만 게임 삭제
//       const [gameDeleteResult] = await connection.query(
//         'DELETE FROM game_state WHERE game_id = ? AND user_id = ?',
//         [req_game_id, req_user_id]
//       );

//       if (gameDeleteResult.affectedRows === 0) {
//         throw "No game was deleted - possible race condition";
//       }
      
//       console.log(`[DELETE_GAME] Deleted game state successfully`);

//       // 트랜잭션 커밋
//       await connection.commit();
      
//     } catch (dbError) {
//       // 트랜잭션 롤백
//       await connection.rollback();
//       throw dbError;
//     }

//   } catch (e) {
//     ret_status = fail_status + -1 * catch_query;
//     ret_data = {
//       code: "query(delete_game)",
//       value: catch_query,
//       value_ext1: ret_status,
//       value_ext2: e.toString(),
//       EXT_data,
//     };
//     console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
//   }

//   // Connection 해제
//   if (connection) {
//     connection.release();
//   }

//   if (ret_status != 200) {
//     return res.status(ret_status).json(ret_data);
//   }

//   //----------------------------------------------------------------------
//   // OpenAI Thread 삭제 (비동기) - DB 삭제 후 별도 처리
//   //----------------------------------------------------------------------
//   if (thread_id_to_delete) {
//     // 비동기로 처리하여 응답 지연 방지
//     setTimeout(async () => {
//       try {
//         await openai.beta.threads.del(thread_id_to_delete);
//         console.log(`[DELETE_GAME] OpenAI thread deleted successfully: ${thread_id_to_delete}`);
//       } catch (openaiError) {
//         // OpenAI 오류는 로그만 남기고 API 응답에는 영향 주지 않음
//         console.error(`[DELETE_GAME] Failed to delete OpenAI thread: ${thread_id_to_delete}`, {
//           error: openaiError.message,
//           thread_id: thread_id_to_delete,
//           game_id: req_game_id
//         });
//       }
//     }, 100); // 100ms 후 실행
//   }
  
//   //----------------------------------------------------------------------
//   // result
//   //----------------------------------------------------------------------
//   ret_data = {
//     code: "result",
//     value: 1,
//     value_ext1: ret_status,
//     value_ext2: {
//       game_id: req_game_id,
//       deleted_thread_id: thread_id_to_delete,
//       message: "게임이 성공적으로 삭제되었습니다. 엔딩 기록은 보존됩니다."
//     },
//     EXT_data,
//   };
//   console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

//   return res.status(ret_status).json(ret_data);
// });

// module.exports = router;
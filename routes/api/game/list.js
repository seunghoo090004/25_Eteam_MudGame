// 'use strict';
// const express = require('express');
// const router = express.Router();
// const my_reqinfo = require('../../../utils/apiReqinfo');
// const pool = require('../../../config/database');

// //========================================================================
// // ✅ 수정: GET 방식으로 변경
// router.get('/', async(req, res) => 
// //========================================================================
// {
//   const LOG_FAIL_HEADER = "[FAIL]";
//   const LOG_SUCC_HEADER = "[SUCC]";
//   const EXT_data = my_reqinfo.get_req_url(req);
  
//   const fail_status = 500;
//   let ret_status = 200;
//   let ret_data;

//   const catch_auth = -1;
//   const catch_sqlconn = -2;
//   const catch_query = -3;

//   //----------------------------------------------------------------------
//   // 인증 확인
//   //----------------------------------------------------------------------
//   let req_user_id;
//   try {
//     if (!req.session || !req.session.userId) throw "user not authenticated";
//     req_user_id = req.session.userId;
//   } catch (e) {
//     ret_status = 401;
//     ret_data = {
//       code: "auth_check",
//       value: catch_auth,
//       value_ext1: ret_status,
//       value_ext2: e,
//       EXT_data,
//     };
//     console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
//     return res.status(ret_status).json(ret_data);
//   }

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
//     return res.status(ret_status).json(ret_data);
//   }

//   //----------------------------------------------------------------------
//   // Query execution
//   //----------------------------------------------------------------------
//   let games_data = [];
//   try {
//     const [games] = await connection.query(
//       `SELECT game_id, user_id, CAST(thread_id AS CHAR) as thread_id, 
//        assistant_id, game_data, created_at, last_updated 
//        FROM game_state 
//        WHERE user_id = ? 
//        ORDER BY last_updated DESC`,
//       [req_user_id]
//     );

//     games_data = games.map(game => {
//       let parsedGameData;
//       try {
//         parsedGameData = typeof game.game_data === 'string' 
//           ? JSON.parse(game.game_data) 
//           : game.game_data;
//       } catch (err) {
//         parsedGameData = {
//           player: { health: 100, maxHealth: 100, status: '양호' },
//           location: { current: "알 수 없음" },
//           inventory: { keyItems: '없음' },
//           progress: { playTime: "방금 시작", deathCount: 0 }
//         };
//       }

//       const now = new Date();
//       const lastUpdated = new Date(game.last_updated);
//       const created = new Date(game.created_at);
//       const playTimeMinutes = Math.floor((lastUpdated - created) / (1000 * 60));
      
//       if (parsedGameData.progress) {
//         parsedGameData.progress.playTime = formatPlayTime(playTimeMinutes);
//       }

//       return {
//         ...game,
//         game_data: parsedGameData
//       };
//     });

//   } catch (e) {
//     ret_status = fail_status + -1 * catch_query;
//     ret_data = {
//       code: "query(game_list)",
//       value: catch_query,
//       value_ext1: ret_status,
//       value_ext2: e,
//       EXT_data,
//     };
//     console.log(LOG_FAIL_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));
//   } finally {
//     connection.release();
//   }

//   if (ret_status != 200) {
//     return res.status(ret_status).json(ret_data);
//   }
  
//   //----------------------------------------------------------------------
//   // result
//   //----------------------------------------------------------------------
//   ret_data = {
//     code: "result",
//     value: games_data.length,
//     value_ext1: ret_status,
//     value_ext2: {
//       games: games_data
//     },
//     EXT_data,
//   };
//   console.log(LOG_SUCC_HEADER + "%s\n", JSON.stringify(ret_data, null, 2));

//   return res.status(ret_status).json(ret_data);
// });

// function formatPlayTime(minutes) {
//   if (minutes < 1) return "방금 시작";
//   if (minutes < 60) return `${minutes}분`;
//   const hours = Math.floor(minutes / 60);
//   const remainingMinutes = minutes % 60;
//   return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
// }

// module.exports = router;
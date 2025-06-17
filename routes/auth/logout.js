// routes/auth/logout.js - 레퍼런스 패턴 적용

'use strict';
const express = require('express');
const router = express.Router();
const my_reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

//========================================================================
// GET 방식의 로그아웃 처리 - 링크나 버튼에서 사용
//========================================================================
router.get('/', csrfProtection, (req, res) => {
    const LOG_HEADER_TITLE = "LOGOUT_GET";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "UserId[" + my_reqinfo.maskId(req.session?.userId) + "] Username[" + my_reqinfo.maskId(req.session?.username) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_session_destroy = -1;
    
    // 로그아웃 전 사용자 정보 기록
    const userId = req.session?.userId;
    const username = req.session?.username;
    
    try {
        // 세션이 없는 경우
        if (!userId) {
            ret_data = {
                code: LOG_HEADER_TITLE + "(no_session)",
                value: 0,
                value_ext1: ret_status,
                value_ext2: "No active session found",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            return res.redirect('/auth/login');
        }
        
        // 세션 파기
        req.session.destroy((err) => {
            if (err) {
                ret_status = fail_status + (-1 * catch_session_destroy);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(session_destroy)",
                    value: catch_session_destroy,
                    value_ext1: ret_status,
                    value_ext2: err.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                return res.status(500).redirect('/?error=logout_failed');
            }
            
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    userId: userId,
                    username: username,
                    loggedOut: true
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: {
                    userId: userId,
                    username: username,
                    loggedOut: true
                }
            }, null, 2));
            
            res.redirect('/auth/login');
        });
        
    } catch (e) {
        const error_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -999,
            value_ext1: 500,
            value_ext2: e.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        res.status(500).redirect('/?error=logout_failed');
    }
});

//========================================================================
router.post('/', csrfProtection, async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "LOGOUT_POST";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "UserId[" + my_reqinfo.maskId(req.session?.userId) + "] Username[" + my_reqinfo.maskId(req.session?.username) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_session_destroy = -1;
    
    // 로그아웃 전 사용자 정보 기록
    const userId = req.session?.userId;
    const username = req.session?.username;
    
    try {
        // 세션이 없는 경우
        if (!userId) {
            ret_data = {
                code: LOG_HEADER_TITLE + "(no_session)",
                value: 0,
                value_ext1: ret_status,
                value_ext2: "No active session found",
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(200).json({
                code: 'LOGOUT_SUCCESS',
                msg: '이미 로그아웃 상태입니다.',
                data: null
            });
        }
        
        // 세션 파기 (Promise로 래핑)
        try {
            await new Promise((resolve, reject) => {
                req.session.destroy((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        } catch (e) {
            ret_status = fail_status + (-1 * catch_session_destroy);
            ret_data = {
                code: LOG_HEADER_TITLE + "(session_destroy)",
                value: catch_session_destroy,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(500).json({
                code: 'LOGOUT_FAILED',
                msg: 'ERROR: 로그아웃 처리 중 오류가 발생했습니다.',
                data: null
            });
        }
        
        //----------------------------------------------------------------------
        // result - 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                userId: userId,
                username: username,
                loggedOut: true
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                userId: userId,
                username: username,
                loggedOut: true
            }
        }, null, 2));
        
        return res.status(ret_status).json({
            code: 'LOGOUT_SUCCESS',
            msg: 'SUCC: 로그아웃이 완료되었습니다.',
            data: null
        });
        
    } catch (e) {
        // 예상치 못한 오류 처리
        const error_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -999,
            value_ext1: 500,
            value_ext2: e.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
        
        return res.status(500).json({
            code: 'LOGOUT_FAILED',
            msg: 'ERROR: 로그아웃 처리 중 예상치 못한 오류가 발생했습니다.',
            data: null
        });
    }
});

module.exports = router;
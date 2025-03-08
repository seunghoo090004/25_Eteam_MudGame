// routes/auth/logout.js
// 사용자 로그아웃 및 세션 파기

const express = require('express');
const router = express.Router();
const reqinfo = require('../../utils/reqinfo');
const csrf = require('csurf');

// CSRF 보호 설정
const csrfProtection = csrf({ cookie: true });

// GET 방식의 로그아웃 처리 - 링크나 버튼에서 사용
router.get('/', csrfProtection, (req, res) => {
    const LOG_HEADER_TITLE = "LOGOUT";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    // 로그아웃 전 사용자 정보 기록
    const userId = req.session.userId;
    const username = req.session.username;
    
    // 세션 파기
    req.session.destroy((err) => {
        if (err) {
            console.error(`[FAIL] ${LOG_HEADER} 로그아웃 중 오류 발생:`, err);
            return res.status(500).redirect('/?error=logout_failed');
        }
        
        console.log(`${LOG_SUCC_HEADER}${LOG_HEADER} 사용자(ID: ${userId}, 이름: ${username}) 로그아웃 완료`);
        res.redirect('/auth/login');
    });
});

// POST 방식의 로그아웃 처리 - AJAX 요청용
router.post('/', csrfProtection, (req, res) => {
    const LOG_HEADER_TITLE = "LOGOUT";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    // 로그아웃 전 사용자 정보 기록
    const userId = req.session.userId;
    const username = req.session.username;
    
    // 세션 파기
    req.session.destroy((err) => {
        if (err) {
            console.error(`[FAIL] ${LOG_HEADER} 로그아웃 중 오류 발생:`, err);
            return res.status(500).json({
                code: 'LOGOUT_FAILED',
                msg: "ERROR: 로그아웃 처리 중 오류가 발생했습니다.",
                data: null
            });
        }
        
        console.log(`${LOG_SUCC_HEADER}${LOG_HEADER} 사용자(ID: ${userId}, 이름: ${username}) 로그아웃 완료`);
        return res.status(200).json({
            code: 'LOGOUT_SUCCESS',
            msg: "SUCC: 로그아웃이 완료되었습니다.",
            data: null
        });
    });
});

module.exports = router;
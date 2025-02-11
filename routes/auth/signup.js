// routes/auth/signup.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');

// GET /auth/signup - 회원가입 페이지 렌더링
router.get('/', function(req, res) {
    // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
    if (req.session.userId) {
        return res.redirect('/');
    }
    // signup.ejs를 렌더링
    res.render('signup');
});

// POST /auth/signup - 회원가입 처리
router.post('/', async(req, res) => {
    const LOG_HEADER_TITLE = "SIGNUP";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    let ret_status = 200;
    let ret_data;
    
    try {
        // 필수 입력값 체크
        if (!req.body.username) throw "username undefined";
        if (!req.body.password) throw "password undefined";
        
        const { username, password } = req.body;
        const connection = await pool.getConnection();
        
        try {
            // 기존 사용자 검사
            const [existingUser] = await connection.query(
                'SELECT * FROM users WHERE username = ?',
                [username]
            );
            
            if (existingUser.length > 0) {
                throw "Username already exists";
            }
            
            // 비밀번호 해싱
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // DB에 사용자 추가
            const [result] = await connection.query(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hashedPassword]
            );
            
            ret_data = { 
                username,
                id: result.insertId 
            };
            
        } finally {
            connection.release(); // DB 연결 해제
        }
        
    } catch (e) {
        ret_status = 501;
        console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
        ret_data = {
            msg: "ERROR: error while " + LOG_HEADER + "getBODY()",
            data: e
        };
        return res.status(ret_status).json(ret_data);
    }
    
    // 성공 응답
    ret_data = {
        msg: "SUCC: signup completed",
        data: ret_data
    };
    
    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
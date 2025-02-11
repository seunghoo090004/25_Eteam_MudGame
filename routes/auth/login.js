// routes/auth/login.js
// 사용자 로그인 처리 및 세션 생성
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../config/database');
const reqinfo = require('../../utils/reqinfo');

// GET 요청 처리 (로그인 페이지 렌더링)
router.get('/', function(req, res) {
    // 이미 로그인된 사용자는 메인 페이지로 리다이렉트
    if (req.session.userId) {
        return res.redirect('/');
    }
    // login.ejs를 렌더링
    res.render('login');
});

router.post('/', async(req, res) => {
    const LOG_HEADER_TITLE = "LOGIN";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    let ret_status = 200;
    let ret_data;
    
    try {
        if (!req.body.username) throw "username undefined";
        if (!req.body.password) throw "password undefined";
        
        const { username, password } = req.body;
        const connection = await pool.getConnection();
        
        try {
            const [users] = await connection.query(
                'SELECT * FROM users WHERE username = ?',
                [username]
            );
            
            if (users.length === 0) {
                throw "User not found";
            }
            
            const user = users[0];
            const isValidPassword = await bcrypt.compare(password, user.password);
            
            if (!isValidPassword) {
                throw "Invalid password";
            }
            
            req.session.userId = user.id;
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            console.log("Session after login:", {
                userId: req.session.userId,
                sessionID: req.sessionID
            });
            
            ret_data = { id: user.id, username: user.username };
            
        } finally {
            connection.release();
        }
        
    } catch (e) {
        ret_status = 501;
        console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
        return res.status(ret_status).json({
            msg: "ERROR: " + e,
            data: null
        });
    }
    
    ret_data = {
        msg: "SUCC: login completed",
        data: ret_data
    };
    
    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
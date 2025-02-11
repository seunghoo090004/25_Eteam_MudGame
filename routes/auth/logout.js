// routes/auth/logout.js
// 사용자 로그아웃 및 세션 파기

const express = require('express');
const router = express.Router();
const reqinfo = require('../../utils/reqinfo');

router.post('/', (req, res) => {
    const LOG_HEADER_TITLE = "LOGOUT";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    req.session.destroy();
    
    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(200)");
    return res.status(200).json({
        msg: "SUCC: logout completed",
        data: null
    });
});

module.exports = router;
// routes/assistant/list.js
// OpenAI 어시스턴트 목록 조회 API 엔드포인트
const express = require('express');
const router = express.Router();
const openai = require('../../config/openai');
const reqinfo = require('../../utils/reqinfo');

router.get('/', async(req, res) => {
    const LOG_HEADER_TITLE = "FETCH_ASSISTANTS";
    const LOG_HEADER = reqinfo.get_req_url(req) + " --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL] ";
    const LOG_SUCC_HEADER = "[SUCC] ";
    
    let ret_status = 200;
    let ret_data;
    
    try {
        const assistants = await openai.beta.assistants.list();
        ret_data = assistants.data.map(assistant => ({
            id: assistant.id,
            name: assistant.name
        }));
        
    } catch (e) {
        ret_status = 501;
        console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
        ret_data = {
            msg: "ERROR: error while " + LOG_HEADER + "getBODY()",
            data: e,
        };
    }
    
    if (ret_status !== 200) {
        return res.status(ret_status).json(ret_data);
    }
    
    ret_data = {
        msg: "SUCC: assistants list retrieved",
        data: ret_data,
    };
    
    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return res.status(ret_status).json(ret_data);
});

module.exports = router;
// routes/index.js
// 메인 페이지 렌더링 및 라우트 설정


const express = require('express');
const router = express.Router();
const openai = require('../config/openai');

router.get('/', async(req, res) => {
    const LOG_HEADER = "ROUTE/MAIN";
    
    try {
        // 로그인 체크
        if (!req.session.userId) {
            console.log(`[${LOG_HEADER}] No session, redirecting to login`);
            return res.redirect('/auth/login');
        }

        // 어시스턴트 목록 가져오기
        const assistants = await openai.beta.assistants.list();
        const assistantList = assistants.data.map(assistant => ({
            id: assistant.id,
            name: assistant.name
        }));

        console.log(`[${LOG_HEADER}] Page loaded successfully with ${assistantList.length} assistants`);
        
        return res.render('index', { 
            assistants: assistantList,
            userId: req.session.userId
        });

    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return res.redirect('/auth/login');
    }
    });

    //============================================================================================
    // 상태 확인용 핑 엔드포인트
    //============================================================================================
    router.get('/ping', (req, res) => {
    const LOG_HEADER = "ROUTE/PING";
    console.log(`[${LOG_HEADER}] Health check`);
    res.status(200).json({ status: 'ok' });
    });

    //============================================================================================
    // 에러 핸들러
    //============================================================================================
    router.use((err, req, res, next) => {
    const LOG_HEADER = "ROUTE/ERROR";
    console.error(`[${LOG_HEADER}] ${err.message || err}`);
    
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: req.app.get('env') === 'development' ? err : {}
    });
});

module.exports = router;
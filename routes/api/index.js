// routes/api/index.js - 엔딩 라우트 추가 버전
// API 라우터 통합 관리

const express = require('express');
const router = express.Router();

// 게임 관련 API
const gameCreateRouter = require('./game/create');
const gameLoadRouter = require('./game/load');
const gameSaveRouter = require('./game/save');
const gameDeleteRouter = require('./game/delete');
const gameListRouter = require('./game/list');
const gameEndingRouter = require('./game/ending'); // 엔딩 라우터 추가

// 채팅 관련 API
const chatSendRouter = require('./chat/send');
const chatHistoryRouter = require('./chat/history');

// 라우터 등록
router.use('/game/create', gameCreateRouter);
router.use('/game/load', gameLoadRouter);
router.use('/game/save', gameSaveRouter);
router.use('/game/delete', gameDeleteRouter);
router.use('/game/list', gameListRouter);
router.use('/game/ending', gameEndingRouter); // 엔딩 라우터 등록
router.use('/game/endings', gameEndingRouter); // 엔딩 목록도 같은 라우터에서 처리

router.use('/chat/send', chatSendRouter);
router.use('/chat/history', chatHistoryRouter);

// API 상태 확인 엔드포인트
router.get('/status', (req, res) => {
    res.json({
        code: "API_STATUS",
        value: 1,
        message: "API Server is running",
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
// routes/api/index.js - 수정된 버전

const express = require('express');
const router = express.Router();

// 게임 관련 API
const gameCreateRouter = require('./game/create');
const gameLoadRouter = require('./game/load');
const gameDeleteRouter = require('./game/delete');
const gameListRouter = require('./game/list');
const gameEndingRouter = require('./game/ending');

// 채팅 관련 API
const chatSendRouter = require('./chat/send');
const chatHistoryRouter = require('./chat/history');

// 게임 라우터 등록
router.use('/game/create', gameCreateRouter);
router.use('/game/current', gameLoadRouter);
router.use('/game/delete', gameDeleteRouter);
router.use('/game/list', gameListRouter);
router.use('/game/ending', gameEndingRouter);

// 채팅 라우터 등록
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
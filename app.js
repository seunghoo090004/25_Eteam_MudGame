// app.js
// Express 애플리케이션 설정 및 미들웨어 구성


const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');

// 필요한 라우터만 불러오기
const indexRouter = require('./routes/index');

// auth routes - 인증 관련 라우터는 유지
const authRouter = require('./routes/auth'); // 인증 관련 모든 라우트 통합


// assistant routes - list만 유지
const assistantListRouter = require('./routes/assistant/list');

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Express가 프록시 환경에서 동작함을 알림
app.set('trust proxy', 1);

// 미들웨어 설정
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 세션 미들웨어 설정
const sessionMiddleware = session({
   secret: process.env.SESSION_SECRET || 'your-secret-key',
   resave: true,
   saveUninitialized: true,
   cookie: { 
      secure: false,  // HTTPS 요구사항 비활성화
      maxAge: 1 * 60 * 60 * 1000, // 24시간
      httpOnly: true,
      sameSite: 'lax'
   }
});

app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO 설정
app.createSocketServer = function(server) {
   return require('./routes/socket')(server, sessionMiddleware);
};

// 필요한 라우터만 설정
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/assistant/list', assistantListRouter);

// 404 에러 핸들러
app.use(function(req, res, next) {
   next(createError(404));
});

// 에러 핸들러
app.use(function(err, req, res, next) {
   res.locals.message = err.message;
   res.locals.error = req.app.get('env') === 'development' ? err : {};
   res.status(err.status || 500);
   res.render('error');
});

module.exports = app;
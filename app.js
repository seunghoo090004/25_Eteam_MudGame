// app.js
// Express 애플리케이션 설정 및 미들웨어 구성

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');

// 필수 유틸리티 임포트
const ApiResponse = require('./lib/ApiResponse');
const AppError = require('./lib/AppError');
const Logger = require('./lib/Logger');

// 필요한 라우터 불러오기
//const indexRouter = require('./routes/index'); 웹 사이트 제거 작업

// auth routes - 인증 관련 라우터는 유지
const authRouter = require('./routes/auth');

// assistant routes - list만 유지
const assistantListRouter = require('./routes/assistant/list');

// ✅ API 라우터 (엔딩 시스템 포함)
const apiRouter = require('./routes/api');

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
app.use(helmet());

// CORS 미들웨어 설정
app.use(cors({
   origin: process.env.NODE_ENV === 'production' ? ['https://mudgame.up.railway.app'] : '*',
   methods: ['GET', 'POST'],
   credentials: true
}));

app.use(helmet({
   contentSecurityPolicy: {
      directives: {
         defaultSrc: ["'self'"],
         scriptSrc: [
            "'self'", 
            "https://ajax.googleapis.com", 
            "https://code.jquery.com", 
            "https://cdn.jsdelivr.net",
            "'unsafe-inline'"
         ],
         scriptSrcAttr: ["'unsafe-inline'"],
         styleSrc: ["'self'", "'unsafe-inline'"],
         connectSrc: ["'self'", "wss://mudgame.up.railway.app"],
         imgSrc: ["'self'", "data:"]
      }
   }
}));

// 세션 미들웨어 설정
const sessionMiddleware = session({
   secret: process.env.SESSION_SECRET || 'your-secret-key',
   resave: true,
   saveUninitialized: true,
   cookie: { 
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1 * 60 * 60 * 1000,
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

// 라우터 설정
//app.use('/', indexRouter); 웹 사이트 제거 작업
app.use('/auth', authRouter);
app.use('/assistant/list', assistantListRouter);

// ✅ API 라우터 등록 (엔딩 시스템 포함)
app.use('/api', apiRouter);

// ─────────────────────────────────────────────────────────
// 404 핸들러
// ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
   const error = new AppError(404, `Cannot ${req.method} ${req.path}`, 'NOT_FOUND');
   next(error);
});

// ─────────────────────────────────────────────────────────
// 전역 에러 핸들러
// ─────────────────────────────────────────────────────────
app.use((error, req, res, next) => {
   // AppError 인스턴스 확인
   if (error instanceof AppError) {
      Logger.error(
         `HTTP/${error.statusCode}`,
         error.message,
         {
            code: error.code,
            details: error.details
         }
      );

      return res.status(error.statusCode).json(error.toJSON());
   }

   // Express 내장 에러 처리
   if (error.status === 403 && error.code === 'EBADCSRFTOKEN') {
      Logger.warn('CSRF_ERROR', 'CSRF token validation failed');
      return res.status(403).json(
         ApiResponse.error(403, 'Invalid CSRF token', 'CSRF_ERROR')
      );
   }

   // 기타 예상 외 에러
   Logger.error('UNEXPECTED_ERROR', 'Unknown error', error);

   const statusCode = error.status || error.statusCode || 500;
   const message = error.message || 'Internal Server Error';

   res.status(statusCode).json(
      ApiResponse.error(
         statusCode,
         message,
         'INTERNAL_ERROR',
         process.env.NODE_ENV === 'development' ? { stack: error.stack } : null
      )
   );
});

module.exports = app;
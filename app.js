// app.js
// Express 애플리케이션 설정 및 미들웨어 구성 (레퍼런스 패턴 적용)

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const my_reqinfo = require('./utils/reqinfo');

// 콘솔 로깅 타임스탬프 설정 (레퍼런스 패턴)
require('console-stamp')(console, { 
    format: ':date(yyyy/mm/dd HH:MM:ss.l)' 
});

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

console.log(LOG_INFO_HEADER + " Program started");

// 필요한 라우터만 불러오기
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
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
         scriptSrc: ["'self'", "https://ajax.googleapis.com", "https://code.jquery.com", "'unsafe-inline'"],
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
      secure: true,
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

// 필요한 라우터만 설정
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/assistant/list', assistantListRouter);

// 404 에러 핸들러 (레퍼런스 패턴 적용)
app.use(function(req, res, next) {
    const EXT_data = my_reqinfo.get_req_url(req);
    
    console.log(LOG_FAIL_HEADER + " 404 Not Found:", JSON.stringify({
        code: "404_NOT_FOUND",
        value: -404,
        value_ext1: 404,
        value_ext2: "Resource not found",
        EXT_data
    }, null, 2));
    
    next(createError(404));
});

// 에러 핸들러 (레퍼런스 패턴 적용)
app.use(function(err, req, res, next) {
    const LOG_HEADER_TITLE = "ERROR_HANDLER";
    const EXT_data = my_reqinfo.get_req_url(req);
    
    // 에러 상태 코드 설정
    let ret_status = err.status || 500;
    
    // 개발 환경에서만 상세 에러 정보 제공
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    
    // 에러 분류
    let error_category;
    if (ret_status === 404) {
        error_category = "NOT_FOUND";
    } else if (ret_status >= 400 && ret_status < 500) {
        error_category = "CLIENT_ERROR";
    } else if (ret_status >= 500) {
        error_category = "SERVER_ERROR";
    } else {
        error_category = "UNKNOWN_ERROR";
    }
    
    // 구조화된 에러 로깅 (레퍼런스 패턴)
    const error_data = {
        code: LOG_HEADER_TITLE + "(" + error_category + ")",
        value: ret_status === 500 ? -1 : ret_status,
        value_ext1: ret_status,
        value_ext2: {
            message: err.message,
            stack: req.app.get('env') === 'development' ? err.stack : undefined,
            category: error_category
        },
        EXT_data
    };
    
    // 에러 레벨에 따른 로깅
    if (ret_status >= 500) {
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER_TITLE + ":", JSON.stringify(error_data, null, 2));
    } else {
        console.log(LOG_INFO_HEADER + " " + LOG_HEADER_TITLE + ":", JSON.stringify(error_data, null, 2));
    }
    
    // API 요청인지 페이지 요청인지 구분
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        // API 요청: JSON 응답
        res.status(ret_status).json({
            code: error_category,
            value: ret_status === 500 ? -1 : ret_status,
            value_ext1: ret_status,
            value_ext2: err.message,
            EXT_data
        });
    } else {
        // 페이지 요청: 에러 페이지 렌더링
        res.status(ret_status);
        res.render('error');
    }
});

const port = process.env.PORT || 3000;
console.log(LOG_INFO_HEADER + " Listening on port " + port);

module.exports = app;
// middleware/auth.js
// 사용자 인증 상태 확인 및 세션 관리 미들웨어 - 레퍼런스 패턴 적용

'use strict';
const my_reqinfo = require('../utils/reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

//============================================================================================
const auth = (req, res, next) => {
//============================================================================================
    const LOG_HEADER_TITLE = "AUTH_MIDDLEWARE";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "SessionUserId[" + my_reqinfo.maskId(req.session?.userId) + "] --> " + LOG_HEADER_TITLE;

    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_session_check = -1;
    const catch_response_type = -2;

    try {
        //----------------------------------------------------------------------
        // 세션 확인
        //----------------------------------------------------------------------
        let userId;
        try {
            userId = req.session?.userId;
            if (!userId) {
                throw new Error("No session found");
            }
        } catch (e) {
            ret_status = 401; // 인증 실패는 401 상태 코드
            ret_data = {
                code: LOG_HEADER_TITLE + "(session_check)",
                value: catch_session_check,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));

            // API 요청인지 페이지 요청인지 구분
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(ret_status).json({
                    success: false,
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            } else {
                return res.redirect('/auth/login');
            }
        }

        //----------------------------------------------------------------------
        // 응답 타입 확인 및 로깅
        //----------------------------------------------------------------------
        try {
            // API 요청인 경우 (AJAX)
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " API authentication successful");
            } 
            // 페이지 요청인 경우
            else {
                console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Page authentication successful");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_response_type);
            ret_data = {
                code: LOG_HEADER_TITLE + "(response_type_check)",
                value: catch_response_type,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            // 응답 타입 확인 실패는 경고로만 처리하고 계속 진행
        }

        //----------------------------------------------------------------------
        // result - 성공 로깅
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                userId: userId,
                authenticated: true,
                isAPI: req.xhr || req.headers.accept?.indexOf('json') > -1
            },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                userId: userId,
                authenticated: true,
                isAPI: req.xhr || req.headers.accept?.indexOf('json') > -1
            }
        }, null, 2));

        next();

    } catch (e) {
        // 예상치 못한 오류 처리
        const error_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -999,
            value_ext1: 500,
            value_ext2: e.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));

        return res.status(500).json({
            success: false,
            error: 'Internal authentication error',
            code: 'AUTH_ERROR'
        });
    }
};

//============================================================================================
// Socket.IO용 인증 미들웨어
//============================================================================================
const socketAuth = (socket, next) => {
    const LOG_HEADER_TITLE = "SOCKET_AUTH_MIDDLEWARE";
    const LOG_HEADER = "SocketId[" + my_reqinfo.maskId(socket.id) + "] SessionUserId[" + my_reqinfo.maskId(socket.request.session?.userId) + "] --> " + LOG_HEADER_TITLE;

    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_session_check = -1;

    const EXT_data = {
        socketId: my_reqinfo.maskId(socket.id),
        sessionUserId: my_reqinfo.maskId(socket.request.session?.userId),
        remoteAddress: socket.request.connection?.remoteAddress
    };

    try {
        //----------------------------------------------------------------------
        // 세션 확인
        //----------------------------------------------------------------------
        let userId;
        try {
            userId = socket.request.session?.userId;
            if (!userId) {
                throw new Error("No session found for socket connection");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_session_check);
            ret_data = {
                code: LOG_HEADER_TITLE + "(session_check)",
                value: catch_session_check,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));

            return next(new Error('Authentication required'));
        }

        //----------------------------------------------------------------------
        // result - 성공 로깅
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                userId: userId,
                socketAuthenticated: true,
                socketId: my_reqinfo.maskId(socket.id)
            },
            EXT_data
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                userId: userId,
                socketAuthenticated: true,
                socketId: my_reqinfo.maskId(socket.id)
            }
        }, null, 2));

        next();

    } catch (e) {
        // 예상치 못한 오류 처리
        const error_data = {
            code: LOG_HEADER_TITLE + "(unexpected_error)",
            value: -999,
            value_ext1: 500,
            value_ext2: e.message,
            EXT_data
        };
        console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));

        next(new Error('Authentication error'));
    }
};

module.exports = {
    auth,
    socketAuth
};
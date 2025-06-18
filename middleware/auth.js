// middleware/auth.js 수정사항
// 세션 확인 부분에 타입 검증 추가

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
        // 세션 확인 (타입 검증 추가)
        //----------------------------------------------------------------------
        let userId;
        try {
            userId = req.session?.userId;
            
            // userId 존재 여부 확인
            if (!userId) {
                throw new Error("No session found");
            }
            
            // **🔧 타입 검증 추가**
            if (typeof userId !== 'string') {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid userId type:", {
                    userId: userId,
                    type: typeof userId,
                    isObject: typeof userId === 'object'
                });
                
                // userId가 객체인 경우 세션 초기화
                if (typeof userId === 'object') {
                    req.session.destroy();
                    throw new Error("Invalid session data - userId must be string");
                }
                
                throw new Error("Invalid userId type");
            }
            
            // **🔧 길이 검증 추가** (새 DB 스키마: VARCHAR(32), 최소 7자)
            if (userId.length < 7 || userId.length > 32) {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid userId length:", {
                    userId: my_reqinfo.maskId(userId),
                    length: userId.length
                });
                
                req.session.destroy();
                throw new Error("Invalid userId format");
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
            }
        };
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: {
                userId: my_reqinfo.maskId(userId),
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
// Socket.IO용 인증 미들웨어 (동일한 검증 로직 추가)
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
        // 세션 확인 (타입 검증 추가)
        //----------------------------------------------------------------------
        let userId;
        try {
            userId = socket.request.session?.userId;
            
            if (!userId) {
                throw new Error("No session found for socket connection");
            }
            
            // **🔧 타입 검증 추가**
            if (typeof userId !== 'string') {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid userId type:", {
                    userId: userId,
                    type: typeof userId,
                    isObject: typeof userId === 'object'
                });
                
                throw new Error("Invalid session data - userId must be string");
            }
            
            // **🔧 길이 검증 추가**
            if (userId.length < 7 || userId.length > 32) {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " Invalid userId length:", {
                    userId: my_reqinfo.maskId(userId),
                    length: userId.length
                });
                
                throw new Error("Invalid userId format");
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
                userId: my_reqinfo.maskId(userId),
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
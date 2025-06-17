// config/database.js
// MySQL 설정 (프로시저 지원 확장 - 레퍼런스 패턴 적용)

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

const isDevelopment = process.env.NODE_ENV !== 'production';

// ============================================================================
// 데이터베이스 연결 설정
// ============================================================================
const dbConfig = {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    ssl: {
        rejectUnauthorized: false
    },
    connectTimeout: 60000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
    multipleStatements: true  // 프로시저 호출을 위해 필요
};

// 개발 환경에서는 SSL 설정 제거
if (isDevelopment) {
    delete dbConfig.ssl;
}

let pool;
let connectionStatus = {
    connected: false,
    lastError: null,
    connectionTime: null,
    reconnectAttempts: 0
};

// ============================================================================
// 연결 풀 생성 및 초기화
// ============================================================================
try {
    pool = mysql.createPool(dbConfig);
    
    // 연결 테스트 및 상세 로깅
    pool.getConnection()
        .then(async connection => {
            try {
                connectionStatus.connected = true;
                connectionStatus.connectionTime = new Date();
                connectionStatus.reconnectAttempts = 0;
                
                console.log(LOG_SUCC_HEADER + " Database connected successfully", {
                    mode: isDevelopment ? 'development' : 'production',
                    host: process.env.MYSQLHOST,
                    port: process.env.MYSQLPORT,
                    database: process.env.MYSQLDATABASE,
                    user: process.env.MYSQLUSER,
                    connection_time: connectionStatus.connectionTime
                });
                
                // 추가 정보 확인
                const [grants] = await connection.query('SHOW GRANTS FOR CURRENT_USER');
                console.log(LOG_INFO_HEADER + " Current user grants:", grants);
                
                const [version] = await connection.query('SELECT VERSION() as version');
                console.log(LOG_INFO_HEADER + " Database version:", version[0].version);
                
                // 프로시저 확인
                const [procedures] = await connection.query(`
                    SELECT ROUTINE_NAME as procedure_name, ROUTINE_TYPE as type
                    FROM INFORMATION_SCHEMA.ROUTINES 
                    WHERE ROUTINE_SCHEMA = DATABASE() 
                      AND ROUTINE_TYPE = 'PROCEDURE'
                      AND ROUTINE_NAME LIKE 'pc%'
                    ORDER BY ROUTINE_NAME
                `);
                console.log(LOG_INFO_HEADER + " Available procedures:", procedures.length);
                
                connection.release();
            } catch (infoError) {
                console.error(LOG_FAIL_HEADER + " Database info query error:", infoError);
                connection.release();
            }
        })
        .catch(err => {
            connectionStatus.connected = false;
            connectionStatus.lastError = err;
            
            const errorDetails = {
                message: err.message,
                code: err.code,
                errno: err.errno,
                sqlState: err.sqlState,
                host: process.env.MYSQLHOST,
                user: process.env.MYSQLUSER,
                database: process.env.MYSQLDATABASE,
                port: process.env.MYSQLPORT,
                ssl_config: dbConfig.ssl
            };
            
            console.error(LOG_FAIL_HEADER + " Database connection error:", JSON.stringify(errorDetails, null, 2));
            
            // 연결 실패 시 환경 변수 확인 (비밀번호는 제외)
            console.log(LOG_INFO_HEADER + " Environment check:", {
                NODE_ENV: process.env.NODE_ENV,
                MYSQLHOST: process.env.MYSQLHOST,
                MYSQLUSER: process.env.MYSQLUSER,
                MYSQLPORT: process.env.MYSQLPORT,
                MYSQLDATABASE: process.env.MYSQLDATABASE,
                SSL_CONFIG: dbConfig.ssl
            });
        });
        
} catch (poolError) {
    console.error(LOG_FAIL_HEADER + " Database pool creation error:", {
        message: poolError.message,
        stack: poolError.stack
    });
    throw poolError;
}

// ============================================================================
// 프로시저 호출 함수 (OUTPUT 파라미터만 있는 경우)
// ============================================================================
async function callProcedure(procedureName, inputParams = []) {
    const LOG_HEADER_TITLE = "CALL_PROCEDURE";
    const LOG_HEADER = "Procedure[" + procedureName + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_sqlconn = -1;
    const catch_procedure_call = -2;
    const catch_result_parse = -3;
    
    const EXT_data = { 
        procedureName, 
        inputParamsCount: inputParams.length,
        inputParamsTypes: inputParams.map(p => typeof p)
    };
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 연결 확보
        //----------------------------------------------------------------------
        try {
            connection = await pool.getConnection();
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sqlconn);
            ret_data = {
                code: LOG_HEADER_TITLE + "(db_connection)",
                value: catch_sqlconn,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        //----------------------------------------------------------------------
        // 처리층: 프로시저 실행
        //----------------------------------------------------------------------
        let procedureResult;
        try {
            const placeholders = inputParams.map(() => '?').join(', ');
            const sql = `CALL ${procedureName}(${placeholders}, @p_result, @p_result2)`;
            
            // 프로시저 실행
            await connection.query(sql, inputParams);
            
            // 출력 파라미터 가져오기
            const [outputs] = await connection.query('SELECT @p_result as result, @p_result2 as result2');
            procedureResult = outputs[0];
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_procedure_call);
            ret_data = {
                code: LOG_HEADER_TITLE + "(procedure_call)",
                value: catch_procedure_call,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        //----------------------------------------------------------------------
        // 출력층: 결과 처리 및 반환
        //----------------------------------------------------------------------
        try {
            const resultCode = parseInt(procedureResult.result);
            const resultMessage = procedureResult.result2;
            
            // 결과 코드가 음수면 실패
            if (resultCode < 0) {
                const errorResult = {
                    success: false,
                    code: resultCode,
                    message: resultMessage,
                    error: resultMessage
                };
                
                // -100은 NOT FOUND (경고 레벨)
                if (resultCode === -100) {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " NOT FOUND:", resultMessage);
                } else {
                    console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " PROCEDURE FAILED:", resultMessage);
                }
                
                return errorResult;
            }
            
            // 성공 결과
            const successResult = {
                success: true,
                code: resultCode,
                message: resultMessage,
                result: resultCode
            };
            
            ret_data = {
                code: "result",
                value: resultCode,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { success: true, code: resultCode, message: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_result_parse);
            ret_data = {
                code: LOG_HEADER_TITLE + "(result_parse)",
                value: catch_result_parse,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
    } finally {
        if (connection) connection.release();
    }
}

// ============================================================================
// 프로시저 호출 함수 (SELECT 결과셋 + OUTPUT 파라미터)
// ============================================================================
async function callSelectProcedure(procedureName, inputParams = []) {
    const LOG_HEADER_TITLE = "CALL_SELECT_PROCEDURE";
    const LOG_HEADER = "Procedure[" + procedureName + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_sqlconn = -1;
    const catch_procedure_call = -2;
    const catch_result_parse = -3;
    
    const EXT_data = { 
        procedureName, 
        inputParamsCount: inputParams.length,
        inputParamsTypes: inputParams.map(p => typeof p)
    };
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 연결 확보
        //----------------------------------------------------------------------
        try {
            connection = await pool.getConnection();
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sqlconn);
            ret_data = {
                code: LOG_HEADER_TITLE + "(db_connection)",
                value: catch_sqlconn,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        //----------------------------------------------------------------------
        // 처리층: SELECT 프로시저 실행 (결과셋 + 출력 파라미터)
        //----------------------------------------------------------------------
        let resultSet, procedureResult;
        try {
            const placeholders = inputParams.map(() => '?').join(', ');
            const sql = `CALL ${procedureName}(${placeholders}, @p_result, @p_result2)`;
            
            // 프로시저 실행 (결과셋 반환)
            const [rows] = await connection.query(sql, inputParams);
            resultSet = rows;
            
            // 출력 파라미터 가져오기
            const [outputs] = await connection.query('SELECT @p_result as result, @p_result2 as result2');
            procedureResult = outputs[0];
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_procedure_call);
            ret_data = {
                code: LOG_HEADER_TITLE + "(procedure_call)",
                value: catch_procedure_call,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        //----------------------------------------------------------------------
        // 출력층: 결과 처리 및 반환
        //----------------------------------------------------------------------
        try {
            const resultCode = parseInt(procedureResult.result);
            const resultMessage = procedureResult.result2;
            
            // 결과 코드가 음수면 실패
            if (resultCode < 0) {
                const errorResult = {
                    success: false,
                    code: resultCode,
                    message: resultMessage,
                    error: resultMessage,
                    data: null
                };
                
                // -100은 NOT FOUND (경고 레벨)
                if (resultCode === -100) {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " NOT FOUND:", resultMessage);
                } else {
                    console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " PROCEDURE FAILED:", resultMessage);
                }
                
                return errorResult;
            }
            
            // 성공 결과
            const successResult = {
                success: true,
                code: resultCode,
                message: resultMessage,
                data: resultSet,
                count: Array.isArray(resultSet) ? resultSet.length : 0
            };
            
            ret_data = {
                code: "result",
                value: resultCode,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { 
                    success: true, 
                    code: resultCode, 
                    message: "***",
                    dataCount: Array.isArray(resultSet) ? resultSet.length : 0
                }
            }, null, 2));
            
            return successResult;
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_result_parse);
            ret_data = {
                code: LOG_HEADER_TITLE + "(result_parse)",
                value: catch_result_parse,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
    } finally {
        if (connection) connection.release();
    }
}

// ============================================================================
// 비즈니스 로직 프로시저 호출 (출력 파라미터가 많은 경우)
// ============================================================================
async function callBusinessProcedure(procedureName, inputParams = [], outputParamNames = []) {
    const LOG_HEADER_TITLE = "CALL_BUSINESS_PROCEDURE";
    const LOG_HEADER = "Procedure[" + procedureName + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_sqlconn = -1;
    const catch_procedure_call = -2;
    const catch_result_parse = -3;
    
    const EXT_data = { 
        procedureName, 
        inputParamsCount: inputParams.length,
        outputParamsCount: outputParamNames.length,
        inputParamsTypes: inputParams.map(p => typeof p)
    };
    let connection;
    
    try {
        //----------------------------------------------------------------------
        // 입력층: 연결 확보
        //----------------------------------------------------------------------
        try {
            connection = await pool.getConnection();
        } catch (e) {
            ret_status = fail_status + (-1 * catch_sqlconn);
            ret_data = {
                code: LOG_HEADER_TITLE + "(db_connection)",
                value: catch_sqlconn,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        //----------------------------------------------------------------------
        // 처리층: 비즈니스 프로시저 실행
        //----------------------------------------------------------------------
        let procedureResult;
        try {
            const inputPlaceholders = inputParams.map(() => '?').join(', ');
            const outputPlaceholders = outputParamNames.map(name => `@${name}`).join(', ');
            const allPlaceholders = inputPlaceholders + 
                (inputPlaceholders && outputPlaceholders ? ', ' : '') + 
                outputPlaceholders + 
                ', @p_result, @p_result2';
            
            const sql = `CALL ${procedureName}(${allPlaceholders})`;
            
            // 프로시저 실행
            await connection.query(sql, inputParams);
            
            // 모든 출력 파라미터 가져오기
            const selectParams = outputParamNames.map(name => `@${name} as ${name}`).join(', ');
            const selectSql = `SELECT ${selectParams}, @p_result as result, @p_result2 as result2`;
            const [outputs] = await connection.query(selectSql);
            procedureResult = outputs[0];
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_procedure_call);
            ret_data = {
                code: LOG_HEADER_TITLE + "(procedure_call)",
                value: catch_procedure_call,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        //----------------------------------------------------------------------
        // 출력층: 결과 처리 및 반환
        //----------------------------------------------------------------------
        try {
            const resultCode = parseInt(procedureResult.result);
            const resultMessage = procedureResult.result2;
            
            // 출력 파라미터 값들 추출
            const outputData = {};
            outputParamNames.forEach(name => {
                outputData[name] = procedureResult[name];
            });
            
            // 결과 코드가 음수면 실패
            if (resultCode < 0) {
                const errorResult = {
                    success: false,
                    code: resultCode,
                    message: resultMessage,
                    error: resultMessage,
                    data: outputData
                };
                
                // -100은 NOT FOUND (경고 레벨)
                if (resultCode === -100) {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " NOT FOUND:", resultMessage);
                } else {
                    console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " PROCEDURE FAILED:", resultMessage);
                }
                
                return errorResult;
            }
            
            // 성공 결과
            const successResult = {
                success: true,
                code: resultCode,
                message: resultMessage,
                data: outputData
            };
            
            ret_data = {
                code: "result",
                value: resultCode,
                value_ext1: ret_status,
                value_ext2: successResult,
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { success: true, code: resultCode, message: "***" }
            }, null, 2));
            
            return successResult;
            
        } catch (e) {
            ret_status = fail_status + (-1 * catch_result_parse);
            ret_data = {
                code: LOG_HEADER_TITLE + "(result_parse)",
                value: catch_result_parse,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
    } finally {
        if (connection) connection.release();
    }
}

// ============================================================================
// UUID 생성 유틸리티
// ============================================================================
function generateUUID() {
    return uuidv4().replace(/-/g, '');
}

// ============================================================================
// 연결 상태 확인 함수
// ============================================================================
function getConnectionStatus() {
    return connectionStatus;
}

// ============================================================================
// 연결 상태 모니터링
// ============================================================================
setInterval(() => {
    if (pool && connectionStatus.connected) {
        pool.getConnection()
            .then(connection => {
                connection.release();
                if (!connectionStatus.connected) {
                    connectionStatus.connected = true;
                    connectionStatus.reconnectAttempts = 0;
                    console.log(LOG_SUCC_HEADER + " Database connection restored");
                }
            })
            .catch(err => {
                if (connectionStatus.connected) {
                    connectionStatus.connected = false;
                    connectionStatus.lastError = err;
                    connectionStatus.reconnectAttempts++;
                    console.error(LOG_FAIL_HEADER + " Database connection lost:", {
                        error: err.message,
                        attempt: connectionStatus.reconnectAttempts
                    });
                }
            });
    }
}, 30000); // 30초마다 체크

// ============================================================================
// 모듈 내보내기
// ============================================================================
module.exports = {
    pool,
    callProcedure,
    callSelectProcedure,
    callBusinessProcedure,
    generateUUID,
    getConnectionStatus
};
// config/database.js
// MySQL 설정 (레퍼런스 패턴 적용)

const mysql = require('mysql2/promise');
require('dotenv').config();

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

const isDevelopment = process.env.NODE_ENV !== 'production';

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
    debug: ['ComQueryPacket', 'RowDataPacket']
};

// 개발 환경에서는 SSL 설정 제거
if (isDevelopment) {
    delete dbConfig.ssl;
}

let pool;
let connectionStatus = {
    connected: false,
    lastError: null,
    connectionTime: null
};

try {
    pool = mysql.createPool(dbConfig);
    
    // 연결 테스트 및 상세 로깅
    pool.getConnection()
        .then(async connection => {
            try {
                connectionStatus.connected = true;
                connectionStatus.connectionTime = new Date();
                
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

// 연결 상태 확인 함수
function getConnectionStatus() {
    return connectionStatus;
}

// 연결 상태 모니터링
setInterval(() => {
    if (pool && connectionStatus.connected) {
        pool.getConnection()
            .then(connection => {
                connection.release();
                if (!connectionStatus.connected) {
                    connectionStatus.connected = true;
                    console.log(LOG_SUCC_HEADER + " Database connection restored");
                }
            })
            .catch(err => {
                if (connectionStatus.connected) {
                    connectionStatus.connected = false;
                    connectionStatus.lastError = err;
                    console.error(LOG_FAIL_HEADER + " Database connection lost:", err.message);
                }
            });
    }
}, 30000); // 30초마다 체크

module.exports = {
    pool,
    getConnectionStatus
};
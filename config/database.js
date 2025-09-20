// config/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

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
    // 연결 타임아웃 설정 개선
    connectTimeout: 20000,      // 20초로 감소
    connectionLimit: 5,         // 연결 수 제한
    maxIdle: 3,                // 최대 유휴 연결
    idleTimeout: 60000,        // 유휴 타임아웃
    queueLimit: 0,
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // 디버그 모드 제거 (성능 향상)
    // debug: ['ComQueryPacket', 'RowDataPacket']
};

// 개발 환경에서는 SSL 설정 제거
if (isDevelopment) {
    delete dbConfig.ssl;
}

const pool = mysql.createPool(dbConfig);

// 연결 테스트 간소화
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log(`✅ Database connected in ${isDevelopment ? 'development' : 'production'} mode`);
        
        // 데이터베이스 버전 확인
        const [version] = await connection.query('SELECT VERSION() as version');
        console.log('Database version:', version[0].version);
        
        connection.release();
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        console.log('Environment check:', {
            NODE_ENV: process.env.NODE_ENV,
            MYSQLHOST: process.env.MYSQLHOST,
            MYSQLPORT: process.env.MYSQLPORT,
            MYSQLDATABASE: process.env.MYSQLDATABASE
        });
    }
})();

// 연결 풀 상태 모니터링 (디버그용)
setInterval(() => {
    if (pool.pool) {
        console.log('Pool stats:', {
            free: pool.pool._freeConnections.length,
            pending: pool.pool._connectionQueue.length,
            total: pool.pool._allConnections.length
        });
    }
}, 30000); // 30초마다 체크

module.exports = pool;
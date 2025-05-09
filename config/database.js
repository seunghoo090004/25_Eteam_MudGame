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
    connectTimeout: 60000, // 타임아웃 60초로 증가
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    debug: ['ComQueryPacket', 'RowDataPacket'] // 디버그 모드 활성화
};
console.log('DB 연결 시도:', {
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    ssl_enabled: !!dbConfig.ssl
});

// 개발 환경에서는 SSL 설정 제거
if (isDevelopment) {
    delete dbConfig.ssl;
}

const pool = mysql.createPool(dbConfig);

// 상세한 연결 테스트 및 로깅
pool.getConnection()
    .then(async connection => {
        // 연결 성공 시 추가 정보 확인
        console.log(`✅ Database connected successfully in ${isDevelopment ? 'development' : 'production'} mode`);
        
        // 현재 사용자 권한 확인
        const [grants] = await connection.query('SHOW GRANTS FOR CURRENT_USER');
        console.log('Current user grants:', grants);
        
        // 데이터베이스 정보 확인
        const [version] = await connection.query('SELECT VERSION() as version');
        console.log('Database version:', version[0].version);
        
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection error:', {
            message: err.message,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            host: process.env.MYSQLHOST,
            user: process.env.MYSQLUSER,
            database: process.env.MYSQLDATABASE,
            port: process.env.MYSQLPORT
        });
        
        // 연결 실패 시 환경 변수 확인 (비밀번호는 제외)
        console.log('Environment check:', {
            NODE_ENV: process.env.NODE_ENV,
            MYSQLHOST: process.env.MYSQLHOST,
            MYSQLUSER: process.env.MYSQLUSER,
            MYSQLPORT: process.env.MYSQLPORT,
            MYSQLDATABASE: process.env.MYSQLDATABASE,
            SSL_CONFIG: dbConfig.ssl
        });
    });

module.exports = pool;
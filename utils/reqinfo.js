// utils/reqinfo.js
// 요청 정보 처리 및 로깅 유틸리티 (레퍼런스 패턴 적용)

"use strict";

//========================================================================
exports.get_req_url = (req) => {
//========================================================================
    let ret;
    try {
        ret = {
            src_ip: req.socket?.remoteAddress?.replace(/^.*:/, '') || req.ip || 'unknown',
            src_port: req.socket?.remotePort || 'unknown',
            req_url: req.originalUrl || req.url || 'unknown',
            req_method: req.method || 'unknown',
            req_body: req.body || {},
            user_agent: req.get('User-Agent') || 'unknown',
            session_id: req.session?.userId || 'anonymous'
        };
    } catch (e) {
        console.log('reqinfo error:', e);
        ret = {
            src_ip: 'error',
            src_port: 'error', 
            req_url: 'error',
            req_method: 'error',
            req_body: {},
            user_agent: 'error',
            session_id: 'error'
        };
    }

    return ret;
};

//========================================================================
exports.maskId = (id) => {
//========================================================================
    if (!id) return 'undefined';
    const str = id.toString();
    if (str.length <= 8) return str;
    return str.substring(0, 4) + '...' + str.substring(str.length - 4);
};
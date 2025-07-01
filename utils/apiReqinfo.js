'use strict';

//========================================================================
exports.get_req_url = (req) => {
//========================================================================
    try {
        return {
        src_ip: req.socket.remoteAddress?.replace(/^.*:/, '') || req.ip,
        src_port: req.socket.remotePort,
        req_url: req.originalUrl,
        req_method: req.method,
        req_body: req.body,
        user_id: req.session?.userId || null,
        username: req.session?.username || null
        };
    } catch (e) {
        console.log(e);
        return "";
    }
}
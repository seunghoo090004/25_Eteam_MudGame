// utils/reqinfo.js
// 요청 정보 처리 및 로깅 유틸리티


const reqinfo = {
    maskId: (id) => {
        if (!id) return 'undefined';
        const str = id.toString();
        if (str.length <= 8) return str;
        return str.substring(0, 4) + '...' + str.substring(str.length - 4);
    },

    get_req_url: (req) => {
        return `${req.method} ${req.originalUrl}`;
    }
};

module.exports = reqinfo;
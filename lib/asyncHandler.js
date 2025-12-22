/**
 * 비동기 라우트 핸들러 래퍼
 * Promise 에러를 자동으로 next()로 전파
 * 
 * @param {Function} fn - 비동기 라우트 핸들러
 * @returns {Function} Express 라우트 핸들러
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = asyncHandler;

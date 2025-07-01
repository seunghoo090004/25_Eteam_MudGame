// public/javascripts/api.js
// Axios 기반 API 통신 모듈

const GameAPI = (function() {
    const baseURL = '';
    
    async function request(method, url, data = null) {
        try {
            const response = await axios({
                method,
                url: `${baseURL}${url}`,
                data,
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                withCredentials: true
            });
            return response.data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error.response?.data || error;
        }
    }
    
    return {
        // 게임 관련 API
        game: {
            list: () => request('POST', '/api/game/list'),
            create: (assistant_id) => request('POST', '/api/game/create', { assistant_id }),
            load: (game_id) => request('POST', '/api/game/load', { game_id }),
            save: (game_id, game_data) => request('POST', '/api/game/save', { game_id, game_data }),
            delete: (game_id) => request('POST', '/api/game/delete', { game_id })
        },
        
        // 채팅 관련 API (향후 구현)
        chat: {
            send: (game_id, message) => request('POST', '/api/chat/send', { game_id, message }),
            history: (game_id) => request('POST', '/api/chat/history', { game_id })
        },
        
        // API 상태 확인
        status: () => request('GET', '/api/status')
    };
})();
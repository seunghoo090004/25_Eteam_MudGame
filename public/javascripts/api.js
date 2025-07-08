// public/javascripts/api.js - 엔딩 API 포함
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
            list: () => request('GET', '/api/game/list'),
            create: (assistant_id, game_mode = 'roguelike') => request('POST', '/api/game/create', { 
                assistant_id, 
                game_mode 
            }),
            load: (game_id) => request('POST', '/api/game/load', { game_id }),
            save: (game_id, game_data, ending_trigger = null) => request('POST', '/api/game/save', { 
                game_id, 
                game_data, 
                ending_trigger 
            }),
            delete: (game_id) => request('POST', '/api/game/delete', { game_id }),
            
            // 엔딩 관련 API
            ending: {
                create: (game_id, ending_data) => request('POST', '/api/game/ending', { 
                    game_id, 
                    ending_data 
                }),
                get: (game_id) => request('GET', `/api/game/ending/${game_id}`),
                list: () => request('GET', '/api/game/ending')
            }
        },
        
        // 채팅 관련 API
        chat: {
            send: (game_id, message) => request('POST', '/api/chat/send', { game_id, message }),
            history: (game_id) => request('POST', '/api/chat/history', { game_id })
        },
        
        // API 상태 확인
        status: () => request('GET', '/api/status')
    };
})();
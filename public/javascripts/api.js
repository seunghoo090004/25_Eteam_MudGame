// public/javascripts/api.js - 수정된 버전

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
            create: (assistant_id, game_mode = 'roguelike') => request('POST', '/api/game/create', { 
                assistant_id, 
                game_mode 
            }),
            loadCurrent: () => request('GET', '/api/game/current'),
            deleteCurrent: () => request('DELETE', '/api/game/current'),
            
            // 엔딩 관련 API
            ending: {
                create: (game_id, ending_data) => request('POST', '/api/game/ending', { 
                    game_id, 
                    ending_data 
                }),
                get: (game_id) => request('GET', `/api/game/ending/${game_id}`),
                list: () => request('GET', '/api/game/ending'),
                getDeathCount: () => request('GET', '/api/game/ending/death-count')
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
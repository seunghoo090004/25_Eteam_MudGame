// routes/socket/services/chat.js
// AI 어시스턴트와의 대화 처리 및 컨텍스트 관리


const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class ChatService {
    async sendMessage(threadId, assistantId, message) {
        const LOG_HEADER = "CHAT_SERVICE/SEND";
        try {
            // 현재 실행 중인 run이 있는지 확인
            const runs = await openai.beta.threads.runs.list(threadId);
            const activeRun = runs.data.find(run => run.status === 'in_progress');
            
            if (activeRun) {
                console.log(`[${LOG_HEADER}] Waiting for previous run to complete`);
                let runStatus;
                do {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                } while (runStatus.status === 'in_progress');
            }

            // 메시지 추가
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: message
            });

            // 새로운 run 시작
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            // 실행 완료 대기 (최대 2분)
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            const startTime = Date.now();
            const timeout = 120000; // 2분
            
            while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
                if (Date.now() - startTime > timeout) {
                    throw "Response timeout";
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                console.log(`[${LOG_HEADER}] Run status: ${runStatus.status}`);
            }

            if (runStatus.status === 'failed') {
                throw runStatus.last_error?.message || 'Assistant run failed';
            }

            if (runStatus.status === 'completed') {
                const messages = await openai.beta.threads.messages.list(threadId);
                console.log(`[${LOG_HEADER}] Message processed successfully`);
                return messages.data[0].content[0].text.value;
            }

            throw `Unexpected run status: ${runStatus.status}`;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    async getMessageHistory(threadId) {
        const LOG_HEADER = "CHAT_SERVICE/HISTORY";
        try {
            const messages = await openai.beta.threads.messages.list(threadId);
            const history = messages.data.map(msg => ({
                role: msg.role,
                content: msg.content[0].text.value,
                created_at: new Date(msg.created_at * 1000)
            }));

            console.log(`[${LOG_HEADER}] Retrieved ${history.length} messages`);
            return history;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    async updateGameContext(threadId, gameState) {
        const LOG_HEADER = "CHAT_SERVICE/UPDATE_CONTEXT";
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `Game State Update:
                    Player Level: ${gameState.player.level}
                    Location: ${gameState.location.current}
                    Phase: ${gameState.progress.phase}`
            });

            console.log(`[${LOG_HEADER}] Game context updated`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    async initializeChat(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/INIT";
        try {
            // 초기 시스템 메시지 설정
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `New game initialization. Please provide an engaging introduction and 
                            initial choices for the player. Remember to maintain the fantasy RPG setting 
                            and provide clear numbered choices for the player.`
            });

            console.log(`[${LOG_HEADER}] Chat initialized`);
            // 초기 응답 받기
            return await this.sendMessage(threadId, assistantId, "시작");

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new ChatService();
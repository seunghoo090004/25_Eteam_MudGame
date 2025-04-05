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
            const history = messages.data
                .map(msg => ({
                    role: msg.role,
                    content: msg.content[0].text.value,
                    created_at: new Date(msg.created_at * 1000)
                }))
                .sort((a, b) => a.created_at - b.created_at); // 시간순 정렬
    
            console.log(`[${LOG_HEADER}] Retrieved ${history.length} messages`);
            return history;
    
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    // routes/socket/services/chat.js에 함수 추가
    async createGameSummary(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/CREATE_SUMMARY";
        try {
            // 요약 메시지 생성
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `### 게임 세션 요약
    이 게임 세션을 새 스레드에 이어갈 수 있도록 핵심 정보를 요약해주세요:
    
    1. 캐릭터 현황: 레벨, 체력, 보유 능력, 중요 관계
    2. 진행 상황: 현재 퀘스트, 미완료 목표, 마지막 선택
    3. 세계 상태: 현재 위치, 영향력 있는 결정, 중요 NPC 상호작용
    4. 보유 자원: 중요 아이템, 골드
    5. 추천 다음 행동: 플레이어가 취할 수 있는 2-3가지 선택지
    
    200단어 이내로 작성하되, 다음 세션에서 일관된 경험을 제공할 수 있는 필수 내용을 포함해야 합니다.`
            });
            
            // 요약 생성을 위한 실행
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });
            
            // 실행 완료 대기
            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                console.log(`[${LOG_HEADER}] Run status: ${runStatus.status}`);
            } while (runStatus.status === 'queued' || runStatus.status === 'in_progress');
            
            if (runStatus.status !== 'completed') {
                throw `Summary generation failed with status: ${runStatus.status}`;
            }
            
            // 생성된 요약 가져오기
            const updatedMessages = await openai.beta.threads.messages.list(threadId);
            const summary = updatedMessages.data[0].content[0].text.value;
            
            console.log(`[${LOG_HEADER}] Summary created successfully`);
            return summary;
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
    
    // 초기 대화 응답 조회 함수 추가
    async getInitialResponse(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/GET_INITIAL_RESPONSE";
        try {
            // 메시지 조회 시도
            const messages = await openai.beta.threads.messages.list(threadId);
            
            if (messages.data.length > 0) {
                console.log(`[${LOG_HEADER}] Initial response found`);
                return messages.data[0].content[0].text.value;
            }
            
            // 메시지가 없으면 초기 메시지 생성
            console.log(`[${LOG_HEADER}] No messages found, creating initial response`);
            return await this.sendMessage(threadId, assistantId, "게임을 계속 진행해주세요");
            
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
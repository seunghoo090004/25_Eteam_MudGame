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
    
            // 게임 형식을 유지하기 위한 지침 추가
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[시스템 지침: 응답에는 반드시 1-4개의 명확한 선택지를 제공하세요. 선택지는 각각 "1.", "2." 등으로 시작하고 각각 새 줄에 배치합니다. 응답 중 선택지가 아닌 부분에는 절대로 숫자+마침표 형식을 사용하지 마세요. 예를 들어 "1. 마을로 가기"와 같은 형식은 오직 선택지에만 사용합니다.]`
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
                const response = messages.data[0].content[0].text.value;
                
                // 선택지 형식 검증
                const choicePattern = /(?:^|\n)(\d+)\.\s*([^\n.]+?)(?:$|\n)/g;
                let choices = [];
                let match;
                
                while ((match = choicePattern.exec(response)) !== null) {
                    if (['1', '2', '3', '4'].includes(match[1])) {
                        choices.push(match[0]);
                    }
                }
                
                // 선택지가 없으면 선택지 생성 요청
                if (choices.length === 0) {
                    console.log(`[${LOG_HEADER}] No valid choices found in response, requesting choices`);
                    
                    // 선택지 생성 요청
                    await openai.beta.threads.messages.create(threadId, {
                        role: "user",
                        content: `이전 응답에 선택지가 없습니다. 플레이어가 선택할 수 있는 1-4개의 선택지를 반드시 제공해주세요. 각 선택지는 "1.", "2." 등으로 시작하고 각각 새 줄에 작성해주세요.`
                    });
                    
                    // 선택지 생성 실행
                    const choiceRun = await openai.beta.threads.runs.create(threadId, {
                        assistant_id: assistantId
                    });
                    
                    // 실행 완료 대기
                    let choiceRunStatus = await openai.beta.threads.runs.retrieve(threadId, choiceRun.id);
                    const choiceStartTime = Date.now();
                    
                    while (choiceRunStatus.status === 'queued' || choiceRunStatus.status === 'in_progress') {
                        if (Date.now() - choiceStartTime > timeout) {
                            throw "Choice generation timeout";
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        choiceRunStatus = await openai.beta.threads.runs.retrieve(threadId, choiceRun.id);
                    }
                    
                    if (choiceRunStatus.status === 'completed') {
                        const updatedMessages = await openai.beta.threads.messages.list(threadId);
                        return updatedMessages.data[0].content[0].text.value;
                    } else {
                        throw `Choice generation failed with status: ${choiceRunStatus.status}`;
                    }
                }
                
                console.log(`[${LOG_HEADER}] Message processed successfully with ${choices.length} choices`);
                return response;
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
            // 요약 메시지 생성 - 응답 형식 명확화
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `### 게임 세션 요약
    이 게임 세션을 새 스레드에 이어갈 수 있도록 핵심 정보를 요약해주세요:
    
    다음 내용을 작성하세요 (번호 없이):
    - 캐릭터 현황: 레벨, 체력, 보유 능력, 중요 관계
    - 진행 상황: 현재 퀘스트, 미완료 목표, 마지막 선택
    - 세계 상태: 현재 위치, 영향력 있는 결정, 중요 NPC 상호작용
    - 보유 자원: 중요 아이템, 골드
    
    ※ 중요: 요약에는 절대로 '1.', '2.' 같은 번호가 붙은 내용을 포함하지 마세요. 선택지처럼 보이는 형식은 피해주세요.
    
    150단어 이내로 작성하되, 다음 세션에서 일관된 경험을 제공할 수 있는 필수 내용을 포함해야 합니다.`
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
                    Location: ${gameState.location.current}
                    Phase: ${gameState.progress.phase}
                    World Info: ${gameState.progress.phase}`
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
            // 초기 시스템 메시지 설정 - 게임 형식을 명확히 지정
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `게임 초기화를 시작합니다. RPG 게임 마스터로서 다음 규칙을 엄격히 준수해주세요:
    
    1. 규칙적인 선택지 형식:
       - 모든 선택지는 반드시 숫자 + 마침표 + 텍스트 형식으로 제공 (예: "1. 마을로 이동한다")
       - 각 선택지는 항상 새 줄에 배치
       - 각 응답에는 1-4개의 명확한 선택지 제공
       - 선택지 외에는 절대로 숫자 + 마침표 형식 사용 금지
    
    2. 게임 상태 정보:
       - 세계관: 튜토리얼
       - 초기 위치: 시작마을
       - 플레이어는 레벨 1에서 시작
    
    3. 응답 형식:
       - 상황 설명 (2-3문단)
       - 선택지 (1-4개)
       
    지금 바로 게임을 시작하고 플레이어에게 첫 번째 선택지를 제시해주세요.`
            });
    
            console.log(`[${LOG_HEADER}] Chat initialized with improved prompting`);
            // 초기 응답 받기
            return await this.sendMessage(threadId, assistantId, "게임을 시작합니다");
    
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new ChatService();
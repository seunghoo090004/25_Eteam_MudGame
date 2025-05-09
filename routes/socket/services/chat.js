// routes/socket/services/chat.js
// AI 어시스턴트와의 대화 처리 및 컨텍스트 관리


const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class ChatService {
    async sendMessage(threadId, assistantId, message) {
        const LOG_HEADER = "CHAT_SERVICE/SEND";
        try {
            // 현재 실행 중인 run이 있는지 확인 및 완료 대기
            const runs = await openai.beta.threads.runs.list(threadId);
            const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
            
            if (activeRun) {
                console.log(`[${LOG_HEADER}] Waiting for previous run to complete: ${activeRun.id}`);
                let runStatus;
                do {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                    console.log(`[${LOG_HEADER}] Run status: ${runStatus.status}`);
                } while (['in_progress', 'queued'].includes(runStatus.status));
            }

            // 메시지 추가 - 문자열 확인 및 변환
            const safeMessage = typeof message === 'string' ? message : String(message);
            
            // 메시지 추가 시도
            try {
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: safeMessage
                });
            } catch (msgError) {
                console.error(`[${LOG_HEADER}] Failed to add message: ${msgError.message}`);
                // 다시 시도 - 10초 대기 후
                await new Promise(resolve => setTimeout(resolve, 10000));
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: safeMessage
                });
            }

            // 게임 형식을 유지하기 위한 지침 추가
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[시스템 지침: 다음 규칙을 반드시 준수하세요:

                1. 던전 환경:
                - 반드시 던전 내부 환경만 묘사할 것
                - 항상 HP, 자원 상태, 위험 수준을 표시할 것
                - 모든 묘사에 던전 요소 5가지 이상 포함할 것

                2. 선택지 형식:
                - 모든 선택지는 "숫자. 텍스트" 형식으로 제공 (예: "1. 통로를 탐색한다")
                - 각 선택지는 새 줄에 시작
                - 선택지 끝에 마침표 넣지 말 것
                - 반드시 1-4개의 명확한 선택지 제공
                - 방향키 의미와 일치해야 함:
                    ↑: 위쪽/위험한 선택
                    ↓: 아래쪽/안전한 선택
                    ←: 탐색/조사 선택
                    →: 직진/적극적 행동]`
            });

            // 새로운 run 시작 - 실행 중 확인 재시도
            let run;
            try {
                run = await openai.beta.threads.runs.create(threadId, {
                    assistant_id: assistantId
                });
            } catch (runError) {
                if (runError.message.includes('while a run is active')) {
                    console.log(`[${LOG_HEADER}] Run already active, waiting 15 seconds and retrying`);
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    run = await openai.beta.threads.runs.create(threadId, {
                        assistant_id: assistantId
                    });
                } else {
                    throw runError;
                }
            }

            // 실행 완료 대기 (최대 2분) - 상태 체크 개선
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            const startTime = Date.now();
            const timeout = 120000; // 2분
            
            while (['queued', 'in_progress'].includes(runStatus.status)) {
                if (Date.now() - startTime > timeout) {
                    throw new Error("Response timeout");
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                console.log(`[${LOG_HEADER}] Run status: ${runStatus.status}`);
            }

            if (runStatus.status === 'failed') {
                throw new Error(runStatus.last_error?.message || 'Assistant run failed');
            }

            if (runStatus.status === 'completed') {
                // 타임아웃 추가하여 메시지 동기화 보장
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const messages = await openai.beta.threads.messages.list(threadId);
                
                if (!messages.data || messages.data.length === 0) {
                    throw new Error("No messages received after completion");
                }
                
                // 첫 번째 메시지 내용 추출 안전 처리
                const firstMessage = messages.data[0];
                if (!firstMessage.content || !firstMessage.content[0] || !firstMessage.content[0].text) {
                    throw new Error("Invalid message format received");
                }
                
                const response = firstMessage.content[0].text.value;
                
                // 선택지 형식 검증
                const choicePattern = /(?:^|\n)(\d+)[\.\)]\s*([^\n\.]+?)(?=$|\n|\.)/g;
                let choices = [];
                let match;
                
                console.log(`[${LOG_HEADER}] 응답 검사:`, response);
                
                while ((match = choicePattern.exec(response)) !== null) {
                    if (['1', '2', '3', '4'].includes(match[1])) {
                        choices.push(match[0]);
                    }
                }
                
                // 선택지가 없으면 선택지 생성 요청
                if (choices.length === 0) {
                    console.log(`[${LOG_HEADER}] No valid choices found in response, requesting choices`);
                    
                    // 선택지 생성 요청 - 기존 run이 완전히 완료될 때까지 기다린 후
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    await openai.beta.threads.messages.create(threadId, {
                        role: "user",
                        content: `이전 응답에서 선택지를 찾을 수 없습니다. 다음 규칙에 따라 1-4개의 선택지를 제공해주세요:

1. 선택지 형식:
   - 각 선택지는 반드시 "숫자. 텍스트" 형식으로 제공 (예: "1. 마을로 이동한다")
   - 각 선택지는 새 줄에 시작
   - 선택지 끝에 마침표를 넣지 마세요
   - 선택지 번호는 1, 2, 3, 4만 사용하세요

상황에 맞는 선택지 4개를 아래 형식으로 제공해주세요:

1. [선택지 1]
2. [선택지 2]
3. [선택지 3]
4. [선택지 4]`
                    });
                    
                    // 선택지 생성 실행 - 이전 실행 완료 확인
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    const choiceRun = await openai.beta.threads.runs.create(threadId, {
                        assistant_id: assistantId
                    });
                    
                    // 실행 완료 대기
                    let choiceRunStatus = await openai.beta.threads.runs.retrieve(threadId, choiceRun.id);
                    const choiceStartTime = Date.now();
                    
                    while (['queued', 'in_progress'].includes(choiceRunStatus.status)) {
                        if (Date.now() - choiceStartTime > timeout) {
                            throw new Error("Choice generation timeout");
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        choiceRunStatus = await openai.beta.threads.runs.retrieve(threadId, choiceRun.id);
                    }
                    
                    if (choiceRunStatus.status === 'completed') {
                        // 완료 후 잠시 대기하여 메시지 동기화
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        const updatedMessages = await openai.beta.threads.messages.list(threadId);
                        
                        if (!updatedMessages.data || updatedMessages.data.length === 0) {
                            throw new Error("No messages received after choice generation");
                        }
                        
                        return updatedMessages.data[0].content[0].text.value;
                    } else {
                        throw new Error(`Choice generation failed with status: ${choiceRunStatus.status}`);
                    }
                }
                
                console.log(`[${LOG_HEADER}] Message processed successfully with ${choices.length} choices`);
                return response;
            }

            throw new Error(`Unexpected run status: ${runStatus.status}`);

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
            
            // 기존 실행 중인 프로세스가 있으면 완료 대기
            const runs = await openai.beta.threads.runs.list(threadId);
            const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
            
            if (activeRun) {
                console.log(`[${LOG_HEADER}] 기존 실행 중인 프로세스 대기: ${activeRun.id}`);
                let runStatus;
                do {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                } while (['in_progress', 'queued'].includes(runStatus.status));
            }
            
            // 요약 생성을 위한 실행 - 충분한 대기 시간 추가
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });
            
            // 실행 완료 대기
            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                console.log(`[${LOG_HEADER}] Run status: ${runStatus.status}`);
            } while (['queued', 'in_progress'].includes(runStatus.status));
            
            if (runStatus.status !== 'completed') {
                throw new Error(`Summary generation failed with status: ${runStatus.status}`);
            }
            
            // 생성된 요약 가져오기 - 메시지 동기화를 위한 대기 시간 추가
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const updatedMessages = await openai.beta.threads.messages.list(threadId);
            
            if (!updatedMessages.data || updatedMessages.data.length === 0) {
                throw new Error("No messages received after summary generation");
            }
            
            // 첫 번째 메시지 내용 추출 안전 처리
            const firstMessage = updatedMessages.data[0];
            if (!firstMessage.content || !firstMessage.content[0] || !firstMessage.content[0].text) {
                throw new Error("Invalid message format received");
            }
            
            const summary = firstMessage.content[0].text.value;
            
            console.log(`[${LOG_HEADER}] Summary created successfully`);
            return summary;
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    async updateGameContext(threadId, gameState) {
        const LOG_HEADER = "CHAT_SERVICE/UPDATE_CONTEXT";
        try {
            // 문자열이 아닌 경우 안전하게 문자열로 변환
            let gameStateStr;
            
            try {
                gameStateStr = typeof gameState === 'string' 
                    ? gameState 
                    : JSON.stringify(gameState);
            } catch (err) {
                console.error(`[${LOG_HEADER}] Error stringifying game state:`, err);
                gameStateStr = "Game state update error";
            }
            
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `Game State Update:
                    Location: ${gameState.location?.current || "알 수 없음"}
                    Phase: ${gameState.progress?.phase || "튜토리얼"}
                    World Info: ${gameState.progress?.phase || "튜토리얼"}`
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
            // 초기 시스템 메시지 설정 - 던전 탈출 게임 형식으로 변경
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***던전 탈출 게임 시스템 지침***

        당신은 던전의 가장 깊은 곳, 축축하고 어두운 돌 감옥에서 깨어납니다. 당신의 유일한 목표는 출구를 찾아 이 던전에서 탈출하는 것입니다.

        **핵심 규칙:**
        - 모든 게임은 100% 한국어로 진행되며 던전 내부에서만 이루어집니다
        - HP 시스템: 모든 플레이어는 100 HP로 시작, 매 묘사마다 "HP: [현재값]/100" 표시
        - 자원 관리: 횃불(각 10턴), 음식(하루 3끼), 물(하루 5회), 치유 도구(+20 HP) 추적
        - 레벨 표시: 모든 묘사에 "현재 위치: 던전 레벨 [N], 출구까지 [M] 레벨 남음" 포함
        - 위험도 표시: 모든 구역에 "위험 수준: [낮음/중간/높음/치명적]" 정보 표시

        **선택지 형식:**
        - 모든 선택지는 "숫자. 텍스트" 형식으로 제공 (예: "1. 통로를 탐색한다")
        - 각 선택지는 새 줄에 시작
        - 선택지는 항상 방향키 의미와 일치해야 함:
        ↑: 항상 "위쪽/출구 방향 진행" 또는 "위험한/용감한 선택"
        ↓: 항상 "아래쪽/시작점 방향" 또는 "안전한/조심스러운 선택"
        ←: 항상 "탐색/조사" 또는 "대안적 접근"
        →: 항상 "앞으로/직접 대결" 또는 "적극적 행동"

        게임을 시작하고 플레이어에게 첫 번째 선택지를 제시해주세요.`
            });
        
            console.log(`[${LOG_HEADER}] 던전 탈출 게임 지침에 따라 초기화됨`);
            
            // 초기 응답 받기
            try {
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다");
            } catch (initError) {
                console.error(`[${LOG_HEADER}] 초기 메시지 오류: ${initError.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다");
            }
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new ChatService();
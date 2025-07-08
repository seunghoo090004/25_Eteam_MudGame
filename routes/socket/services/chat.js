// routes/socket/services/chat.js - 로그라이크 시스템 버전

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class ChatService {
    async sendMessage(threadId, assistantId, message) {
        const LOG_HEADER = "CHAT_SERVICE/SEND";
        try {
            // 현재 실행 중인 run 완료 대기
            const runs = await openai.beta.threads.runs.list(threadId);
            const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
            
            if (activeRun) {
                console.log(`[${LOG_HEADER}] Waiting for previous run to complete: ${activeRun.id}`);
                let runStatus;
                do {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                } while (['in_progress', 'queued'].includes(runStatus.status));
            }

            const safeMessage = typeof message === 'string' ? message : String(message);
            
            // 로그라이크 선택지 처리
            try {
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `선택: ${safeMessage}번`
                });
            } catch (msgError) {
                console.error(`[${LOG_HEADER}] Failed to add message: ${msgError.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `선택: ${safeMessage}번`
                });
            }

            // 로그라이크 게임 지침
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[로그라이크 게임 마스터 지침]

**선택 ${safeMessage}번 처리:**
1. 선택한 행동을 실행합니다
2. 턴을 1 증가시킵니다
3. 턴별 위험도를 적용합니다:
   - 1-3턴: 60% 즉사율
   - 4-6턴: 70% 즉사율  
   - 7-10턴: 80% 즉사율
   - 11턴+: 50% 즉사율 (탈출 기회)

**응답 형식 (필수):**
[던전 상황 설명 - 위험 요소 포함]

STATS
===============================================
Turn: [현재 턴]
Location: [위치 정보]
Time: [경과 시간]
Discoveries: [발견한 정보]
===============================================

↑ [행동]
↓ [행동]  
← [행동]
→ [행동]

**핵심 규칙:**
- 체력 없음: 즉사 OR 생존
- 잘못된 선택 시 즉시 사망
- 아이템 발견 시 즉시 사용 후 소멸
- 11턴 후 탈출 기회 제공
- 위험도에 따른 즉사 확률 적용

즉사 조건 충족 시 "당신은 죽었습니다"로 시작하여 사망 원인을 설명하세요.`
            });

            // 새로운 run 시작
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

            // 실행 완료 대기
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            const startTime = Date.now();
            const timeout = 120000;
            
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
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const messages = await openai.beta.threads.messages.list(threadId);
                
                if (!messages.data || messages.data.length === 0) {
                    throw new Error("No messages received after completion");
                }
                
                const firstMessage = messages.data[0];
                if (!firstMessage.content || !firstMessage.content[0] || !firstMessage.content[0].text) {
                    throw new Error("Invalid message format received");
                }
                
                let response = firstMessage.content[0].text.value;
                
                // 응답 정리
                response = this.cleanResponse(response);
                
                console.log(`[${LOG_HEADER}] Message processed and cleaned`);
                return response;
            }

            throw new Error(`Unexpected run status: ${runStatus.status}`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    // 응답 정리 함수
    cleanResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/CLEAN_RESPONSE";
        
        let cleanedResponse = response;
        
        // 1. 불필요한 메타 정보 제거
        cleanedResponse = cleanedResponse.replace(/\[게임 마스터[^\]]*\]/g, '');
        cleanedResponse = cleanedResponse.replace(/\[시스템[^\]]*\]/g, '');
        
        // 2. 구분선 정리
        cleanedResponse = cleanedResponse.replace(/={10,}/g, '===============================================');
        
        // 3. 빈 줄 정리
        cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
        
        console.log(`[${LOG_HEADER}] Response cleaned successfully`);
        return cleanedResponse;
    }

    // 로그라이크 게임 응답에서 상태 정보 파싱
    parseGameResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/PARSE_RESPONSE";
        
        try {
            const gameState = {
                location: { current: "알 수 없음" },
                discoveries: [],
                turn_count: 1,
                is_death: false
            };

            // 사망 체크
            if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
                gameState.is_death = true;
                
                // 사망 원인 추출
                const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                                response.match(/당신은 ([^.]+)로 인해 죽었습니다/i);
                if (deathMatch) {
                    gameState.death_cause = deathMatch[1].trim();
                }
            }

            // STATS 섹션 파싱
            const statsPattern = /STATS[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 턴 정보
                const turnPattern = /Turn:\s*(\d+)/;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.turn_count = parseInt(turnMatch[1]);
                }
                
                // 위치 정보
                const locationPattern = /Location:\s*([^\n]+)/;
                const locationMatch = statsContent.match(locationPattern);
                if (locationMatch) {
                    gameState.location.current = locationMatch[1].trim();
                }
                
                // 발견 정보
                const discoveryPattern = /Discoveries:\s*([^\n]+)/;
                const discoveryMatch = statsContent.match(discoveryPattern);
                if (discoveryMatch) {
                    const discoveryText = discoveryMatch[1].trim();
                    if (discoveryText !== '없음' && discoveryText !== 'None') {
                        gameState.discoveries = discoveryText.split(',').map(d => d.trim());
                    }
                }
            }

            console.log(`[${LOG_HEADER}] Parsed game state:`, gameState);
            return gameState;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Parse error:`, e);
            return null;
        }
    }

    async initializeChat(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/INIT";
        try {
            // 로그라이크 게임 초기화
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***10턴 로그라이크 던전 탈출 게임 - 시스템 초기화***

당신은 극도로 위험한 로그라이크 던전 게임의 게임 마스터입니다.

**핵심 설정:**
- 체력 없음: 즉사 OR 생존
- 턴 기반: 각 선택마다 턴 증가
- 위험도: 1-10턴 극도 위험, 11턴+ 탈출 기회
- 즉시 사용 아이템: 발견 시 자동 사용 후 소멸

**위험도 시스템:**
- 1-3턴: 60% 즉사율 (함정, 추락)
- 4-6턴: 70% 즉사율 (독, 몬스터)  
- 7-10턴: 80% 즉사율 (복합 위험)
- 11턴+: 50% 즉사율 (탈출 기회)

**응답 형식 (필수):**
[던전 상황 설명]

STATS
===============================================
Turn: [턴 번호]
Location: [위치]
Time: [시간]
Discoveries: [발견 정보]
===============================================

↑ [행동]
↓ [행동]
← [행동] 
→ [행동]

**중요 규칙:**
1. 잘못된 선택 시 즉시 사망
2. 아이템 발견 시 즉시 사용
3. 11턴 후 탈출 루트 제공
4. 사망 시 "당신은 죽었습니다" 명시

게임을 시작하세요.`
            });

            console.log(`[${LOG_HEADER}] System initialized`);
            
            try {
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");
            } catch (initError) {
                console.error(`[${LOG_HEADER}] Initial message error: ${initError.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");
            }

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
                .filter(msg => {
                    // 시스템 메시지 필터링
                    const content = msg.content[0]?.text?.value || '';
                    return !content.includes('[로그라이크 게임 마스터 지침]') &&
                           !content.includes('[시스템 내부') &&
                           !content.includes('선택:') &&
                           msg.role === 'assistant';
                })
                .map(msg => ({
                    role: msg.role,
                    content: msg.content[0].text.value,
                    created_at: new Date(msg.created_at * 1000)
                }))
                .sort((a, b) => a.created_at - b.created_at);

            console.log(`[${LOG_HEADER}] Retrieved ${history.length} messages`);
            return history;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    // 로그라이크 게임 요약 생성
    async createGameSummary(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/CREATE_SUMMARY";
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `### 로그라이크 게임 세션 요약 생성

이 로그라이크 게임 세션을 새 스레드에 이어갈 수 있도록 요약해주세요:

**요약 형식:**
현재 턴: [턴 번호]
위치: [현재 위치]  
사망 횟수: [사망 횟수]
발견 정보: [중요한 발견들]
진행 상황: [주요 경험과 상황]

100단어 이내로 간결하게 작성하세요.`
            });

            const runs = await openai.beta.threads.runs.list(threadId);
            const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
            
            if (activeRun) {
                let runStatus;
                do {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                } while (['in_progress', 'queued'].includes(runStatus.status));
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });
            
            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            } while (['queued', 'in_progress'].includes(runStatus.status));
            
            if (runStatus.status !== 'completed') {
                throw new Error(`Summary generation failed with status: ${runStatus.status}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const updatedMessages = await openai.beta.threads.messages.list(threadId);
            const summary = updatedMessages.data[0].content[0].text.value;
            
            console.log(`[${LOG_HEADER}] Summary created successfully`);
            return summary;
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    // 로그라이크 게임 재개 초기화
    async initializeChatFromSummary(threadId, assistantId, summary) {
        const LOG_HEADER = "CHAT_SERVICE/INIT_FROM_SUMMARY";
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[시스템 내부 - 로그라이크 게임 재개]

게임 요약: ${summary}

위 정보를 바탕으로 로그라이크 게임을 이어서 진행하되, 요약 내용을 사용자에게 표시하지 마세요.`
            });

            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***로그라이크 게임 재개***

**응답 형식 필수 준수:**

[던전 상황 설명]

STATS
===============================================
Turn: [현재 턴]
Location: [위치]
Time: [시간]  
Discoveries: [발견 정보]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

**핵심 규칙:**
- 체력 없음 (즉사/생존)
- 턴별 위험도 적용
- 아이템 즉시 사용
- 11턴+ 탈출 기회

게임을 이어서 진행하세요.`
            });

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            } while (['queued', 'in_progress'].includes(runStatus.status));

            if (runStatus.status === 'completed') {
                const messages = await openai.beta.threads.messages.list(threadId);
                const response = messages.data[0].content[0].text.value;
                return this.cleanResponse(response);
            }

            throw new Error('Game resume failed');

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new ChatService();
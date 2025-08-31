// routes/socket/services/chat.js - 16턴 시스템 적용 (기존 기능 보존)

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class ChatService {
    constructor() {
        // 생존 선택지 보장을 위한 메모리
        this.survivalChoices = new Map(); // threadId -> survivalChoices array
    }

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
            
            // 생존 보장 로직 확인
            const guaranteedSurvival = this.checkSurvivalGuarantee(threadId, safeMessage);
            
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

            // 로그라이크 게임 지침 (생존 보장 추가)
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: this.generateGameInstructions(safeMessage, guaranteedSurvival)
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
                
                // 다음 턴을 위한 생존 선택지 설정
                this.setSurvivalChoicesForNextTurn(threadId);
                
                console.log(`[${LOG_HEADER}] Message processed and cleaned`);
                return response;
            }

            throw new Error(`Unexpected run status: ${runStatus.status}`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    // 생존 보장 확인 (단계별 생존 선택지 개수 적용)
    checkSurvivalGuarantee(threadId, selectedChoice) {
        const survivalChoices = this.survivalChoices.get(threadId) || [];
        
        if (survivalChoices.includes(parseInt(selectedChoice))) {
            console.log(`[SURVIVAL_GUARANTEE] Choice ${selectedChoice} is guaranteed survival for thread ${threadId}`);
            return true;
        }
        
        return false;
    }

    // 턴에 따른 생존 선택지 개수 계산
    getSurvivalCountForTurn(turn) {
        if (turn >= 1 && turn <= 3) return 2;      // 초급: 50% 생존율
        if (turn >= 4 && turn <= 7) return 1;      // 중급: 25% 생존율
        if (turn >= 8 && turn <= 12) return 1;     // 고급: 25% 생존율
        if (turn >= 13 && turn <= 16) return 3;    // 최종: 75% 생존율
        return 1; // 기본값
    }

    // 다음 턴을 위한 생존 선택지 설정 (단계별 개수 적용)
    setSurvivalChoicesForNextTurn(threadId, currentTurn = 1) {
        const nextTurn = currentTurn + 1;
        const survivalCount = this.getSurvivalCountForTurn(nextTurn);
        
        // 1-4 중에서 생존 선택지 랜덤 선택
        const allChoices = [1, 2, 3, 4];
        const survivalChoices = [];
        
        for (let i = 0; i < survivalCount; i++) {
            const randomIndex = Math.floor(Math.random() * allChoices.length);
            survivalChoices.push(allChoices.splice(randomIndex, 1)[0]);
        }
        
        this.survivalChoices.set(threadId, survivalChoices);
        console.log(`[SURVIVAL_GUARANTEE] Turn ${nextTurn} survival choices for thread ${threadId}: [${survivalChoices.join(', ')}]`);
    }

    // 게임 지침 생성 (16턴 시스템 + 단계별 생존 보장 + 몬스터 시스템)
    generateGameInstructions(selectedChoice, guaranteedSurvival) {
        const baseInstructions = `[로그라이크 게임 마스터 지침]

**선택 ${selectedChoice}번 처리:**
1. 선택한 행동을 실행합니다
2. 턴을 1 증가시킵니다
3. 단계별 생존율을 적용합니다:
   - 초급 단계 (1-3턴): 생존 선택지 2개, 즉사 선택지 2개
   - 중급 단계 (4-7턴): 생존 선택지 1개, 즉사 선택지 3개
   - 고급 단계 (8-12턴): 생존 선택지 1개, 즉사 선택지 3개
   - 최종 단계 (13-16턴): 생존 선택지 3개, 즉사 선택지 1개
   - 16턴+ 탈출 기회 제공

**몬스터 조우 시스템:**
- 1-3턴: 30% 확률로 고블린, 스켈레톤 출현
- 4-7턴: 50% 확률로 오크, 트롤 출현  
- 8-12턴: 70% 확률로 리치, 데몬 출현
- 13-16턴: 드래곤 조우 가능성

**전투 처리 원칙:**
- 아이템 사용 시 즉시 처치 (간편한 해결)
- 아이템 없이도 지형/환경/전략으로 처치 가능
- 전투 묘사 3문장 이내 필수
- 몬스터별 특성: 고블린(집단공격), 스켈레톤(물리저항), 오크(둔함), 트롤(재생), 리치(마법), 데몬(다능력), 드래곤(최강)

**응답 형식 (필수):**
[던전 상황 설명 - 위험 요소/몬스터 포함]

통계
===============================================
턴: [현재 턴]
위치: [위치 정보]
발견: [발견한 정보]
===============================================

↑ [행동]
↓ [행동]  
← [행동]
→ [행동]

**핵심 규칙:**
- 체력 없음: 즉사 OR 생존
- 잘못된 선택 시 즉시 사망
- 아이템 발견 시 즉시 사용 후 소멸
- 16턴 후 탈출 기회 제공
- 단계별 생존율 엄격 적용

**선택지 특징:**
- 생존 선택지:"조사한다", "관찰한다", "신중히 확인한다" 류의 행동
겉보기에 위험해 보이지만 실제로는 안전
- 즉사 선택지 특징:
성급한 행동, 충동적 선택
겉보기에 안전해 보이는 함정
명백히 위험한 행동

:**중요 제한사항 (절대 준수):**::
- 몬스터, 아이템, 특수 상황 등 어떤 요소도 위 생존율을 변경할 수 없음
- 4개 선택지 구조는 절대 변경 불가 
- 모든 상황은 반드시 1턴 내 완료 (전투, 이벤트 포함)
- 복잡한 시스템이나 단계적 진행 절대 금지
- 생존율 우선 원칙: 다른 모든 규칙보다 생존율이 최우선`;

        // 생존 보장이 있는 경우 특별 지침 추가
        if (guaranteedSurvival) {
            return baseInstructions + `

**🛡️ 특별 지침: 이번 선택은 반드시 생존해야 합니다.**
- 선택한 행동이 성공적으로 실행됩니다
- 위험한 상황이 있어도 운 좋게 피하거나 극복합니다
- 사망하지 않고 다음 상황으로 진행합니다
- 하지만 여전히 긴장감 있는 상황을 만들어주세요

즉사 조건이 있어도 이번에는 생존시키고, 다음 턴의 선택지를 제시하세요.`;
        }

        return baseInstructions + `

즉사 조건 충족 시 "당신은 죽었습니다"로 시작하여 사망 원인을 설명하세요.`;
    }

    // 응답 정리 함수
    cleanResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/CLEAN_RESPONSE";
        
        let cleanedResponse = response;
        
        // 1. 불필요한 메타 정보 제거
        cleanedResponse = cleanedResponse.replace(/\[게임 마스터[^\]]*\]/g, '');
        cleanedResponse = cleanedResponse.replace(/\[시스템[^\]]*\]/g, '');
        cleanedResponse = cleanedResponse.replace(/\[🛡️[^\]]*\]/g, ''); // 생존 보장 메시지 제거
        
        // 2. 구분선 정리
        cleanedResponse = cleanedResponse.replace(/={10,}/g, '===============================================');
        
        // 3. 빈 줄 정리
        cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
        
        console.log(`[${LOG_HEADER}] Response cleaned successfully`);
        return cleanedResponse;
    }

    // 로그라이크 게임 응답에서 상태 정보 파싱 - 수정된 형식 지원
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

            // 통계 섹션 파싱 (한글 + 영문 지원)
            const statsPattern = /(통계|STATS)[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[2];
                
                // 턴 정보
                const turnPattern = /(턴|Turn):\s*(\d+)/;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.turn_count = parseInt(turnMatch[2]);
                }
                
                // 위치 정보
                const locationPattern = /(위치|Location):\s*([^\n]+)/;
                const locationMatch = statsContent.match(locationPattern);
                if (locationMatch) {
                    gameState.location.current = locationMatch[2].trim();
                }
                
                // 발견 정보
                const discoveryPattern = /(발견|Discoveries):\s*([^\n]+)/;
                const discoveryMatch = statsContent.match(discoveryPattern);
                if (discoveryMatch) {
                    const discoveryText = discoveryMatch[2].trim();
                    if (discoveryText !== '없음' && discoveryText !== 'None' && discoveryText !== '') {
                        gameState.discoveries = discoveryText.split(',').map(d => d.trim()).filter(d => d);
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
            // 16턴 로그라이크 게임 초기화 + 몬스터 시스템
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***차원의 감옥: 불가능한 탈출 - 16턴 + 몬스터 시스템 초기화***

당신은 극도로 위험한 로그라이크 던전 게임의 게임 마스터입니다.

**핵심 설정:**
- 체력 없음: 즉사 OR 생존
- 턴 기반: 각 선택마다 턴 증가
- 목표: 15턴 내 극한 생존 후 16턴부터 탈출 기회
- 즉시 사용 아이템: 발견 시 자동 사용 후 소멸

**단계별 생존 시스템:**
- 초급 단계 (1-3턴): 생존 선택지 2개, 즉사 선택지 2개 (50% 생존율)
- 중급 단계 (4-7턴): 생존 선택지 1개, 즉사 선택지 3개 (25% 생존율)
- 고급 단계 (8-12턴): 생존 선택지 1개, 즉사 선택지 3개 (25% 생존율)
- 최종 단계 (13-16턴): 생존 선택지 3개, 즉사 선택지 1개 (75% 생존율)
- 16턴+: 탈출 기회 제공

**몬스터 조우 시스템:**
- 1-3턴: 30% 확률로 고블린, 스켈레톤 출현
- 4-7턴: 50% 확률로 오크, 트롤 출현
- 8-12턴: 70% 확률로 리치, 데몬 출현
- 13-16턴: 드래곤 조우 가능성

**몬스터별 특성 및 처치 방법:**
- 고블린: 약하지만 집단 공격, 아이템 없이도 도망/기습으로 처치 가능
- 스켈레톤: 물리 공격에 강함, 아이템 없이도 관절 파괴나 함정 이용으로 처치
- 오크: 강력하지만 둔함, 아이템 없이도 지형 이용이나 함정으로 처치
- 트롤: 재생 능력, 아이템 없이도 불이나 환경적 요소로 처치
- 리치: 강력한 마법사, 아이템 없이도 마법 차단이나 기습으로 처치
- 데몬: 다양한 능력, 아이템 없이도 약점 공격이나 환경 이용으로 처치
- 드래곤: 최강 존재, 1회용 아이템이나 특별한 전략으로 처치

**전투 묘사 방식:**
- 전투 발생: 1문장으로 상황 설명
- 아이템 사용: 1문장으로 효과 묘사  
- 결과: 1문장으로 처치/제거 완료
- 총 전투 묘사: 3문장 이내 필수

**응답 형식 (필수):**
[던전 상황 설명]

통계
===============================================
턴: [턴 번호]
위치: [위치]
발견: [발견 정보]
===============================================

↑ [행동]
↓ [행동]
← [행동] 
→ [행동]

**선택지 설계 원칙:**
생존 선택지 특징:
- "조사한다", "관찰한다", "신중히 확인한다" 류의 행동
- 겉보기에 위험해 보이지만 실제로는 안전

즉사 선택지 특징:
- 성급한 행동, 충동적 선택
- 겉보기에 안전해 보이는 함정
- 명백히 위험한 행동

**중요 규칙:**
1. 잘못된 선택 시 즉시 사망
2. 아이템 발견 시 즉시 사용
3. 16턴 후 탈출 루트 제공
4. 사망 시 "당신은 죽었습니다" 명시
5. 단계별 생존율 엄격 적용
6. 몬스터 전투 시 3문장 이내 묘사
7. 모든 몬스터는 아이템 없이도 처치 방법 존재

게임을 시작하세요.`
            });

            console.log(`[${LOG_HEADER}] System initialized`);
            
            // 첫 턴을 위한 생존 선택지 설정 (1턴 = 초급 단계 = 2개 생존)
            this.setSurvivalChoicesForNextTurn(threadId, 0);
            
            try {
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");
            } catch (initError) {
                console.error(`[${LOG_HEADER}] Initial message error: ${initError.message}`);
                await new Promise(resolve => setTimeout(resolve, 100000));
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

통계
===============================================
턴: [현재 턴]
위치: [위치]
발견: [발견 정보]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

**핵심 규칙:**
- 체력 없음 (즉사/생존)
- 단계별 생존율 적용
- 아이템 즉시 사용
- 16턴+ 탈출 기회
- 단계별 생존 선택지 개수 엄격 적용

게임을 이어서 진행하세요.`
            });

            // 재개된 게임을 위한 생존 선택지 설정
            this.setSurvivalChoicesForNextTurn(threadId);

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
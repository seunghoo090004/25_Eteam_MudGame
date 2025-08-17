// routes/socket/services/chat.js - 16턴 시스템 업데이트

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class ChatService {
    constructor() {
        // 생존 선택지 보장을 위한 메모리
        this.survivalChoices = new Map(); // threadId -> survivalChoice
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

            // 16턴 로그라이크 게임 지침
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

            // run 완료 대기
            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            } while (['queued', 'in_progress'].includes(runStatus.status));

            if (runStatus.status === 'completed') {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const messages = await openai.beta.threads.messages.list(threadId);
                const response = messages.data[0].content[0].text.value;
                
                return this.cleanResponse(response);
            }

            throw new Error(`AI 응답 실패: ${runStatus.status}`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    generateGameInstructions(userChoice, guaranteedSurvival) {
        return `[16턴 로그라이크 던전 탈출 게임 - 시스템 지침]

**핵심 규칙:**
- 16턴 시스템: 1-3턴(초급/50%), 4-7턴(중급/25%), 8-12턴(고급/25%), 13-16턴(최종/75%)
- 체력 없음: 즉사 또는 생존만 존재
- 생존 보장: ${guaranteedSurvival ? `선택 ${userChoice}번은 반드시 생존` : '일반 난이도 적용'}

**몬스터 조우 시스템:**
- 1-3턴: 고블린, 스켈레톤 (30% 확률)
- 4-7턴: 오크, 트롤 (50% 확률)  
- 8-12턴: 리치, 데몬 (70% 확률)
- 13-16턴: 드래곤 (탈출 시도 시)

**1회용 아이템:**
- 발견 시 즉시 발동, 저장 불가
- 전투 보조로 빠른 해결
- 예시: 부러진 단검, 썩은 횃불, 깨진 병

**필수 응답 형식:**
[던전 상황 묘사 - 위험 요소와 분위기 포함]

통계
===============================================
턴: [현재 턴 번호]
위치: [현재 위치명]
발견: [중요 발견 정보]
===============================================

↑ [북쪽/위쪽 행동]
↓ [남쪽/아래쪽 행동]
← [서쪽/왼쪽 행동]  
→ [동쪽/오른쪽 행동]

**선택지 설계:**
- 생존 선택지: "조사한다", "관찰한다", "신중히 확인한다"
- 즉사 선택지: 성급한 행동, 명백히 위험한 행동

**언어 규칙:**
- 모든 응답 한글 필수
- 자연스러운 한국어 사용

게임을 계속 진행하세요.`;
    }

    checkSurvivalGuarantee(threadId, userChoice) {
        // 16턴 시스템에 따른 생존 보장 로직
        const choice = parseInt(userChoice);
        if (!choice || choice < 1 || choice > 4) return false;

        // 각 턴별 생존 보장 선택지 설정
        let survivalChoice = this.survivalChoices.get(threadId) || Math.floor(Math.random() * 4) + 1;
        
        const isGuaranteed = choice === survivalChoice;
        
        // 다음 턴을 위한 새로운 생존 선택지 설정
        this.setSurvivalChoiceForNextTurn(threadId);
        
        return isGuaranteed;
    }

    setSurvivalChoiceForNextTurn(threadId) {
        const newChoice = Math.floor(Math.random() * 4) + 1;
        this.survivalChoices.set(threadId, newChoice);
    }

    cleanResponse(response) {
        if (!response) return '';
        
        // 시스템 메시지 제거
        const cleaned = response
            .replace(/\[로그라이크 게임 마스터 지침\][\s\S]*?\n\n/g, '')
            .replace(/\[시스템 내부[\s\S]*?\]/g, '')
            .replace(/선택:\s*\d+번[\s\S]*?\n/g, '')
            .trim();
        
        return cleaned;
    }

    async parseGameStateFromResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/PARSE_STATE";
        
        try {
            if (!response) return null;
            
            const gameState = {};
            
            // 사망 체크
            if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
                gameState.is_dead = true;
                
                const deathMatch = response.match(/사망 원인:\s*([^\n]+)/i);
                if (deathMatch) {
                    gameState.death_cause = deathMatch[1].trim();
                }
            }

            // 한글 STATS 섹션 파싱
            const statsPattern = /통계[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 턴 정보
                const turnPattern = /턴:\s*(\d+)/;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.turn_count = parseInt(turnMatch[1]);
                }
                
                // 위치 정보
                const locationPattern = /위치:\s*([^\n]+)/;
                const locationMatch = statsContent.match(locationPattern);
                if (locationMatch) {
                    gameState.location = { current: locationMatch[1].trim() };
                }
                
                // 발견 정보
                const discoveryPattern = /발견:\s*([^\n]+)/;
                const discoveryMatch = statsContent.match(discoveryPattern);
                if (discoveryMatch) {
                    const discoveryText = discoveryMatch[1].trim();
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
            // 16턴 로그라이크 게임 초기화
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***16턴 로그라이크 던전 탈출 게임 - 시스템 초기화***

당신은 극도로 위험한 16턴 로그라이크 던전 게임의 게임 마스터입니다.

**핵심 규칙:**
- 16턴 생존 시스템: 1-3턴(초급/50%), 4-7턴(중급/25%), 8-12턴(고급/25%), 13-16턴(최종/75%)
- 체력 없음: 즉사 또는 생존만 존재
- 매 턴 4개 선택지 제공
- 생존 선택지: "조사한다", "관찰한다", "신중히 확인한다" 류
- 즉사 선택지: 성급한 행동, 명백히 위험한 행동

**몬스터 조우:**
- 1-3턴: 고블린, 스켈레톤 (30% 확률)
- 4-7턴: 오크, 트롤 (50% 확률)
- 8-12턴: 리치, 데몬 (70% 확률)
- 13-16턴: 드래곤 (탈출 시도 시)

**1회용 아이템:**
- 발견 시 즉시 발동 후 소멸
- 전투를 빠르게 종료시키는 역할

**필수 응답 형식:**
[던전 상황 묘사]

통계
===============================================
턴: [현재 턴 번호]
위치: [현재 위치명]
발견: [중요 발견 정보]
===============================================

↑ [북쪽/위쪽 행동]
↓ [남쪽/아래쪽 행동]  
← [서쪽/왼쪽 행동]
→ [동쪽/오른쪽 행동]

**게임 시작:**
차원의 감옥에서 기억 상실 상태로 깨어나는 새로운 상황을 생성하세요.`
            });

            // 생존 선택지 설정
            this.setSurvivalChoiceForNextTurn(threadId);

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

            throw new Error('Game initialization failed');

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            
            // 폴백 초기화
            try {
                console.log(`[${LOG_HEADER}] Attempting fallback initialization`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");
            } catch (initError) {
                console.error(`[${LOG_HEADER}] Initial message error: ${initError.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");
            }
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
                content: `[시스템 내부 - 게임 요약 생성]

현재까지의 게임 진행 상황을 다음 형식으로 요약해주세요:

**게임 요약:**
- 현재 턴: X턴
- 현재 위치: [위치명]
- 주요 발견사항: [발견한 것들]
- 중요 사건들: [주요 사건 2-3개]
- 현재 상황: [현재 처한 상황]

이 요약은 게임 재개를 위한 것입니다.`
            });

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

위 정보를 바탕으로 16턴 로그라이크 게임을 이어서 진행하되, 요약 내용을 사용자에게 표시하지 마세요.`
            });

            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***로그라이크 게임 재개***

**응답 형식 필수 준수:**

[던전 상황 설명]

통계
===============================================
턴: [현재 턴]
위치: [현재 위치]
발견: [발견사항]
===============================================

↑ [북쪽/위쪽 행동]
↓ [남쪽/아래쪽 행동]
← [서쪽/왼쪽 행동]
→ [동쪽/오른쪽 행동]

**핵심 규칙:**
- 16턴 시스템
- 매 턴 4개 선택지 중 적절한 생존율 적용
- 아이템 즉시 사용
- 13턴+ 탈출 기회

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
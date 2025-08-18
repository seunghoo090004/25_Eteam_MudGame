// routes/socket/services/chat.js - 기존 구조 유지하며 Time 필드만 제거

const openai = require('../../../config/openai');

class ChatService {
    constructor() {
        this.survivalChoices = new Map();
    }

    // 서바이벌 선택지 보장 시스템
    getChoiceSymbol(choice) {
        const symbols = { 1: '↑', 2: '↓', 3: '←', 4: '→' };
        return symbols[choice] || '?';
    }

    setSurvivalChoiceForNextTurn(threadId) {
        const survivalChoice = Math.floor(Math.random() * 4) + 1; // 1, 2, 3, 4 중 랜덤
        this.survivalChoices.set(threadId, survivalChoice);
        console.log(`[SURVIVAL_GUARANTEE] Next survival choice for thread ${threadId}: ${survivalChoice}`);
    }

    // 게임 지침 생성 (생존 보장 포함)
    generateGameInstructions(selectedChoice, guaranteedSurvival) {
        const baseInstructions = `[로그라이크 게임 마스터 지침]

**선택 ${selectedChoice}번 처리:**
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
- 위험도에 따른 즉사 확률 적용`;

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
                                response.match(/당신은 ([^.]+)로 인해 죽었습니다/i) ||
                                response.match(/([^.\n]+)로 인해 죽었습니다/i);
                if (deathMatch) {
                    gameState.death_cause = deathMatch[1].trim();
                }
            }

            // STATS 섹션 파싱 (Time 필드 제거)
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
            // 로그라이크 게임 초기화
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***10턴 로그라이크 던전 탈출 게임 - 시스템 초기화***

당신은 극도로 위험한 로그라이크 던전 게임의 게임 마스터입니다.

**핵심 규칙:**
- 체력 시스템 없음 (즉사 or 생존)
- 잘못된 선택 시 즉시 사망
- 아이템 발견 시 즉시 사용 후 소멸
- 11턴 후 탈출 기회 제공

**필수 응답 형식:**
[던전 상황 설명]

STATS
===============================================
Turn: [턴 번호]
Location: [위치 정보]
Discoveries: [발견한 정보]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

게임을 시작하세요.`
            });

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 2000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            } while (['queued', 'in_progress'].includes(runStatus.status));

            if (runStatus.status === 'completed') {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const messages = await openai.beta.threads.messages.list(threadId);
                
                if (messages.data && messages.data.length > 0) {
                    const response = messages.data[0].content[0].text.value;
                    return this.cleanResponse(response);
                }
            }

            throw new Error(`Assistant run failed with status: ${runStatus.status}`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error:`, e);
            throw e;
        }
    }

    async sendMessage(threadId, assistantId, message, gameData) {
        const LOG_HEADER = "CHAT_SERVICE/SEND";
        
        try {
            // 선택지 파싱 (↑1 ↓2 ←3 →4)
            let selectedChoice = null;
            const choicePatterns = [
                { pattern: /↑|위|북|1번?/i, value: 1 },
                { pattern: /↓|아래|남|2번?/i, value: 2 },
                { pattern: /←|왼쪽|서|3번?/i, value: 3 },
                { pattern: /→|오른쪽|동|4번?/i, value: 4 }
            ];

            for (const choice of choicePatterns) {
                if (choice.pattern.test(message)) {
                    selectedChoice = choice.value;
                    break;
                }
            }

            if (!selectedChoice) {
                throw new Error("유효한 선택지를 입력해주세요 (↑, ↓, ←, →)");
            }

            // 생존 보장 체크
            const guaranteedSurvival = this.survivalChoices.get(threadId) === selectedChoice;
            
            // 게임 지침 생성
            const gameInstructions = this.generateGameInstructions(selectedChoice, guaranteedSurvival);
            
            // 메시지 전송
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `${gameInstructions}

플레이어 선택: ${selectedChoice}번 (${this.getChoiceSymbol(selectedChoice)})

선택한 행동을 실행하고 결과를 보여주세요.`
            });

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });

            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 2000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            } while (['queued', 'in_progress'].includes(runStatus.status));

            if (runStatus.status === 'completed') {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const messages = await openai.beta.threads.messages.list(threadId);
                
                if (messages.data && messages.data.length > 0) {
                    const response = messages.data[0].content[0].text.value;
                    
                    // 다음 턴 생존 선택지 설정
                    this.setSurvivalChoiceForNextTurn(threadId);
                    
                    return this.cleanResponse(response);
                }
            }

            throw new Error(`Assistant run failed with status: ${runStatus.status}`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error:`, e);
            throw e;
        }
    }

    async parseGameStateFromResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/PARSE";
        
        try {
            const gameState = {
                turn_count: null,
                location: { current: null },
                discoveries: [],
                is_death: false,
                death_cause: null
            };

            // 사망 감지
            if (response.includes("당신은 죽었습니다") || response.includes("죽었습니다")) {
                gameState.is_death = true;
                
                const deathMatch = response.match(/원인[:\s]*([^.\n]+)/i) || 
                                response.match(/([^.\n]+)로 인해 죽었습니다/i);
                if (deathMatch) {
                    gameState.death_cause = deathMatch[1].trim();
                }
            }

            // STATS 섹션 파싱 (Time 필드 제거)
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

    async getMessageHistory(threadId) {
        const LOG_HEADER = "CHAT_SERVICE/HISTORY";
        
        try {
            const messages = await openai.beta.threads.messages.list(threadId);
            
            const history = messages.data
                .filter(msg => {
                    const content = msg.content[0]?.text?.value || '';
                    return !content.includes('[로그라이크 게임 마스터 지침]') &&
                           !content.includes('[시스템 내부') &&
                           !content.includes('선택:') &&
                           !content.includes('***로그라이크 던전 탈출 게임');
                })
                .reverse()
                .map(msg => ({
                    role: msg.role,
                    content: msg.content[0]?.text?.value || '',
                    timestamp: msg.created_at
                }));

            console.log(`[${LOG_HEADER}] Retrieved ${history.length} messages`);
            return history;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error:`, e);
            throw e;
        }
    }
}

module.exports = new ChatService();
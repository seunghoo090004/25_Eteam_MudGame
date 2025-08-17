// routes/socket/services/chat.js - 업데이트된 버전

const openai = require('../../../config/openai');
const gameService = require('./game');

class ChatService {
    constructor() {
        // 생존 보장을 위한 선택지 저장
        this.survivalChoices = new Map();
    }

    // 메시지 전송
    async sendMessage(threadId, assistantId, message) {
        const LOG_HEADER = "CHAT_SERVICE/SEND_MESSAGE";
        
        try {
            // 사용자 메시지 추가
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: message
            });

            // 선택지 번호 파싱 (1, 2, 3, 4)
            const selectedChoice = this.parseChoiceNumber(message);
            
            if (selectedChoice) {
                // 턴별 난이도에 따른 생존 보장 설정
                const gameState = await this.getGameStateFromThread(threadId);
                const turn = gameState?.turn_count || 1;
                const difficulty = gameService.getTurnDifficulty(turn + 1); // 다음 턴
                
                this.setSurvivalChoiceForNextTurn(threadId, selectedChoice, difficulty);
            }

            // 실행
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId,
                instructions: this.generateGameInstructions(selectedChoice, turn)
            });

            // 완료 대기
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            
            while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            }

            if (runStatus.status === 'failed') {
                throw new Error('Assistant run failed');
            }

            // 응답 메시지 가져오기
            const messages = await openai.beta.threads.messages.list(threadId);
            const assistantMessage = messages.data.find(msg => 
                msg.role === 'assistant' && 
                msg.run_id === run.id
            );

            if (!assistantMessage) {
                throw new Error('No assistant response found');
            }

            const responseContent = assistantMessage.content[0].text.value;
            
            console.log(`[${LOG_HEADER}] Message sent successfully`);
            return responseContent;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    // 선택지 번호 파싱
    parseChoiceNumber(message) {
        const choice = parseInt(message.trim());
        return (choice >= 1 && choice <= 4) ? choice : null;
    }

    // 난이도별 생존 선택지 설정
    setSurvivalChoiceForNextTurn(threadId, selectedChoice, difficulty) {
        const survivingChoices = [];
        
        // 난이도에 따른 생존 선택지 개수만큼 랜덤 생성
        for (let i = 0; i < difficulty.survivingChoices; i++) {
            let choice;
            do {
                choice = Math.floor(Math.random() * 4) + 1; // 1-4
            } while (survivingChoices.includes(choice));
            survivingChoices.push(choice);
        }
        
        this.survivalChoices.set(threadId, survivingChoices);
        console.log(`[SURVIVAL_GUARANTEE] Stage: ${difficulty.stage}, Surviving choices: ${survivingChoices.join(',')}`);
    }

    // 게임 지침 생성 (새 지침 적용)
    generateGameInstructions(selectedChoice, turn) {
        const difficulty = gameService.getTurnDifficulty(turn);
        const guaranteedSurvival = this.survivalChoices.has(threadId) && 
                                  this.survivalChoices.get(threadId).includes(selectedChoice);

        const baseInstructions = `[로그라이크 던전 탈출 게임 마스터 지침]

**선택 ${selectedChoice}번 처리:**
1. 선택한 행동을 실행합니다
2. 턴을 1 증가시킵니다
3. 점진적 난이도를 적용합니다:
   - 1-3턴: 50% 생존율 (초급) - 생존 선택지 2개
   - 4-7턴: 25% 생존율 (중급) - 생존 선택지 1개
   - 8-12턴: 25% 생존율 (고급) - 생존 선택지 1개
   - 13-16턴: 75% 생존율 (최종) - 생존 선택지 3개, 탈출 기회

**필수 응답 형식:**
[차원의 감옥 상황 묘사 - 위험 요소와 분위기 포함]

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

**핵심 규칙:**
- 체력 없음: 즉사 또는 생존만 존재
- 선택지 구성: 항상 4개 선택지 제공
- 생존 선택지: "조사한다", "관찰한다", "신중히 확인한다"
- 즉사 선택지: 성급한 행동, 안전해 보이는 함정
- 1회용 아이템: 발견 시 즉시 발동 후 소멸
- 16턴 이후 탈출 기회 제공

**몬스터 조우 시스템:**
- 1-3턴: 30% 확률 (고블린, 스켈레톤)
- 4-7턴: 50% 확률 (오크, 트롤)
- 8-12턴: 70% 확률 (리치, 데몬)
- 13-16턴: 탈출 시도 시 드래곤 가능`;

        // 생존 보장이 있는 경우 특별 지침 추가
        if (guaranteedSurvival) {
            return baseInstructions + `

**🛡️ 특별 지침: 이번 선택은 반드시 생존해야 합니다.**
**선택지는 응답에 포함하지 않습니다. 시스템에서 별도 처리됩니다.**`;
        }

        return baseInstructions + `

**선택지는 응답에 포함하지 않습니다. 시스템에서 별도 처리됩니다.**`;
    }

    // 게임 상태 파싱 (응답에서 게임 정보 추출)
    parseGameResponse(response) {
        if (!response || typeof response !== 'string') {
            return null;
        }

        const parsed = {};

        // 통계 섹션 파싱
        const statsMatch = response.match(/통계\s*={3,}([\s\S]*?)={3,}/);
        if (statsMatch) {
            const statsContent = statsMatch[1];
            
            // 턴 파싱
            const turnMatch = statsContent.match(/턴:\s*(\d+)/);
            if (turnMatch) {
                parsed.turn_count = parseInt(turnMatch[1]);
            }
            
            // 위치 파싱
            const locationMatch = statsContent.match(/위치:\s*([^\n]+)/);
            if (locationMatch) {
                parsed.location = {
                    current: locationMatch[1].trim()
                };
            }
            
            // 발견 파싱
            const discoveryMatch = statsContent.match(/발견:\s*([^\n]+)/);
            if (discoveryMatch) {
                const discovery = discoveryMatch[1].trim();
                if (discovery !== '없음' && discovery !== '') {
                    parsed.discoveries = [discovery];
                }
            }
        }

        // 사망 체크
        if (response.includes('당신은 죽었습니다') || response.includes('죽었습니다')) {
            parsed.ending = {
                type: 'death',
                cause: this.extractDeathCause(response)
            };
        }

        // 탈출 체크
        const escapeKeywords = ['탈출', '출구', '자유', '밖으로', '빛이 보인다'];
        if (escapeKeywords.some(keyword => response.includes(keyword))) {
            parsed.ending = {
                type: 'escape'
            };
        }

        return Object.keys(parsed).length > 0 ? parsed : null;
    }

    // 사망 원인 추출
    extractDeathCause(response) {
        const patterns = [
            /사망 원인[:\s]*([^.\n]+)/i,
            /원인[:\s]*([^.\n]+)/i,
            /([^.\n]+)(?:로|으로|에)\s*인해\s*죽었습니다/i,
            /([^.\n]+)(?:로|으로|에)\s*인해\s*사망/i
        ];

        for (const pattern of patterns) {
            const match = response.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        return '알 수 없는 원인';
    }

    // 메시지 히스토리 가져오기
    async getMessageHistory(threadId) {
        const LOG_HEADER = "CHAT_SERVICE/GET_HISTORY";
        
        try {
            const messages = await openai.beta.threads.messages.list(threadId);
            
            const history = messages.data
                .filter(msg => {
                    const content = msg.content[0]?.text?.value || '';
                    // 시스템 메시지 제외
                    return !content.includes('[차원의 감옥 탈출 게임 마스터 지침]') &&
                           !content.includes('[시스템 내부') &&
                           !content.includes('선택:');
                })
                .map(msg => ({
                    role: msg.role,
                    content: msg.content[0].text.value,
                    created_at: new Date(msg.created_at * 1000)
                }))
                .reverse(); // 시간순 정렬

            console.log(`[${LOG_HEADER}] Retrieved ${history.length} messages`);
            return history;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    // 게임 초기화 (새 게임 시작)
    async initializeChat(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/INITIALIZE";
        
        try {
            // 초기 지침 전송
            const initialInstructions = `[차원의 감옥 탈출 게임 시작]

매 게임마다 다른 상황에서 시작하되, 다음 조건을 만족해야 함:
- 플레이어는 기억 상실 상태로 깨어남
- 차원의 감옥 내 어딘가에 위치
- 위험하고 불안한 분위기 조성
- 초급 단계 규칙 적용 (생존 선택지 2개, 즉사 선택지 2개)

응답 형식:
[상황 묘사]

통계
===============================================
턴: 1
위치: [위치명]
발견: 없음
===============================================

선택지는 응답에 포함하지 않습니다.`;

            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId,
                instructions: initialInstructions
            });

            // 완료 대기
            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            
            while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            }

            if (runStatus.status === 'failed') {
                throw new Error('Assistant initialization failed');
            }

            // 응답 가져오기
            const messages = await openai.beta.threads.messages.list(threadId);
            const initialMessage = messages.data.find(msg => 
                msg.role === 'assistant' && 
                msg.run_id === run.id
            );

            if (!initialMessage) {
                throw new Error('No initialization response found');
            }

            const response = initialMessage.content[0].text.value;
            
            console.log(`[${LOG_HEADER}] Chat initialized successfully`);
            return response;

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    // 스레드에서 게임 상태 가져오기 (헬퍼 함수)
    async getGameStateFromThread(threadId) {
        try {
            const messages = await openai.beta.threads.messages.list(threadId, { limit: 10 });
            const lastMessage = messages.data.find(msg => msg.role === 'assistant');
            
            if (lastMessage) {
                return this.parseGameResponse(lastMessage.content[0].text.value);
            }
            
            return null;
        } catch (e) {
            console.error('Error getting game state from thread:', e);
            return null;
        }
    }
}

module.exports = new ChatService();
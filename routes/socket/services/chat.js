// routes/socket/services/chat.js - 새 형식 파싱 버전

const pool = require('../../../config/database');
const openai = require('../../../config/openai');

class ChatService {
    async sendMessage(threadId, assistantId, message) {
        const LOG_HEADER = "CHAT_SERVICE/SEND";
        try {
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
            
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `선택: ${safeMessage}번\n\n선택한 행동의 결과를 보여주세요.`
            });

            let run;
            try {
                run = await openai.beta.threads.runs.create(threadId, {
                    assistant_id: assistantId
                });
            } catch (runError) {
                if (runError.message.includes('while a run is active')) {
                    await new Promise(resolve => setTimeout(resolve, 15000));
                    run = await openai.beta.threads.runs.create(threadId, {
                        assistant_id: assistantId
                    });
                } else {
                    throw runError;
                }
            }

            let runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
            const startTime = Date.now();
            const timeout = 120000;
            
            while (['queued', 'in_progress'].includes(runStatus.status)) {
                if (Date.now() - startTime > timeout) {
                    throw new Error("Response timeout");
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
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

    cleanResponse(response) {
        let cleanedResponse = response;
        cleanedResponse = cleanedResponse.replace(/위험도:\s*[^\n]+\s*/g, '');
        cleanedResponse = cleanedResponse.replace(/(↑|↓|←|→)\s*([^-\n]+)\s*-\s*[^\n]+/g, '$1 $2');
        cleanedResponse = cleanedResponse.replace(/={10,}/g, '===============================================');
        cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
        
        return cleanedResponse;
    }

    // ✅ 수정: 새 형식 파싱
    parseGameResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/PARSE_RESPONSE";
        
        try {
            const gameState = {
                location: { current: "알 수 없음" },
                player: { health: 100, maxHealth: 100, status: '양호', mental: '안정' },
                inventory: { items: [], gold: 0 },
                progress: { turnCount: 0 }
            };

            // 위치 정보 추출 (Location: 형식)
            const locationPattern = /Location:\s*([^\n]+)/i;
            const locationMatch = response.match(locationPattern);
            if (locationMatch) {
                gameState.location.current = locationMatch[1].trim();
            }

            // STATS 섹션 파싱
            const statsPattern = /STATS\s*={3,}([\s\S]*?)={3,}/i;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 체력 정보 (Health: 형식)
                const healthPattern = /Health:\s*(\d+)\/(\d+)/i;
                const healthMatch = statsContent.match(healthPattern);
                if (healthMatch) {
                    gameState.player.health = parseInt(healthMatch[1]);
                    gameState.player.maxHealth = parseInt(healthMatch[2]);
                }
                
                // 턴 수 (Turn: 형식)
                const turnPattern = /Turn:\s*(\d+)/i;
                const turnMatch = statsContent.match(turnPattern);
                if (turnMatch) {
                    gameState.progress.turnCount = parseInt(turnMatch[1]);
                }
                
                // 시간 정보
                const timePattern = /Time:\s*([^\n]+)/i;
                const timeMatch = statsContent.match(timePattern);
                if (timeMatch) {
                    gameState.progress.playTime = timeMatch[1].trim();
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
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `게임 시작을 위한 시스템 초기화

당신은 10턴 데스 던전 탈출 게임의 게임 마스터입니다.

**응답 형식 (반드시 준수):**
[던전 내 상황 묘사(위험한 던전)]

STATS
===============================================
Health: [현재]/[최대] 
Time: [시간]
Location: [던전 내 정보]
Turn: [현재턴]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

**중요 규칙:**
- 1-10턴: 극고난이도 (70-80% 사망률)
- 11턴 이후: 탈출 모드
- 모든 응답은 위 형식 준수
- 한글로만 출력

게임을 시작하세요.`
            });

            return await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");

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
                .sort((a, b) => a.created_at - b.created_at);

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
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `게임 세션 요약 생성

현재 게임 상태를 요약하여 새 스레드에서 이어갈 수 있도록 해주세요.

**요약 형식:**
캐릭터: [레벨, 체력, 상태]
위치: [현재 위치, 던전 층수]
진행: [주요 행동, 턴 수]
발견: [아이템, 단서]

150단어 이내로 작성하세요.`
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
                throw new Error(`Summary generation failed: ${runStatus.status}`);
            }
            
            const updatedMessages = await openai.beta.threads.messages.list(threadId);
            const summary = updatedMessages.data[0].content[0].text.value;
            
            console.log(`[${LOG_HEADER}] Summary created`);
            return summary;
            
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }

    async initializeChatFromSummary(threadId, assistantId, summary) {
        const LOG_HEADER = "CHAT_SERVICE/INIT_FROM_SUMMARY";
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[시스템] 게임 재개 정보:
${summary}

위 정보를 바탕으로 게임을 이어서 진행하되, 요약을 사용자에게 표시하지 마세요.
반드시 다음 형식으로 응답:

[던전 내 상황 묘사]

STATS
===============================================
Health: [현재]/[최대] 
Time: [시간]
Location: [던전 내 정보]
Turn: [현재턴]
===============================================

↑ [행동]
↓ [행동] 
← [행동]
→ [행동]

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
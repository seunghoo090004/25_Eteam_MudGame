// routes/socket/services/chat.js - 스토리 연결성 및 내부정보 숨김 개선

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

            const safeMessage = typeof message === 'string' ? message : String(message);
            
            // ✅ 수정: 행동-결과 연결성 강화
            try {
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `선택: ${safeMessage}번\n\n[중요] 이 선택지의 행동을 실제로 수행한 결과를 보여주세요. 선택지와 무관한 새로운 위치로 이동하지 말고, 선택한 행동의 직접적인 결과를 먼저 설명한 후 자연스럽게 상황을 전개하세요.`
                });
            } catch (msgError) {
                console.error(`[${LOG_HEADER}] Failed to add message: ${msgError.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `선택: ${safeMessage}번\n\n선택한 행동의 결과를 보여주세요.`
                });
            }

            // ✅ 수정: 스토리 연결성 강화 시스템 메시지
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[게임 마스터 지시사항]

**선택 ${safeMessage}번 처리 방법:**
1. 먼저 플레이어가 선택한 행동을 실제로 수행합니다
2. 그 행동의 직접적인 결과를 설명합니다
3. 결과에 따라 자연스럽게 상황이 전개됩니다
4. 필요시 새로운 위치로 이동하되, 논리적 연결이 있어야 합니다

**응답 형식:**
===============================================
         던전 탈출 - [층수]
===============================================

>> 위치: [ID] - [방 이름]

[선택한 행동의 결과 + 상황 전개]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [자연스러운 시간]
위치: [층 정보]

경고: [간단한 경고]
===============================================

↑ [현재 상황에 맞는 행동]
↓ [현재 상황에 맞는 행동]
← [현재 상황에 맞는 행동]
→ [현재 상황에 맞는 행동]

**금지사항:**
- 선택지와 무관한 갑작스런 위치 이동
- 위험도 표시
- 선택지에 "- 부가설명" 추가
- 층수 표기 불일치

선택한 행동을 충실히 반영하여 게임을 진행하세요!`
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
        
        // 1. 위험도 관련 줄 제거
        cleanedResponse = cleanedResponse.replace(/위험도:\s*[^\n]+\s*/g, '');
        
        // 2. 선택지에서 "- 부가설명" 부분 제거
        cleanedResponse = cleanedResponse.replace(/(↑|↓|←|→)\s*([^-\n]+)\s*-\s*[^\n]+/g, '$1 $2');
        
        // 3. 여러 개의 구분선 정리
        cleanedResponse = cleanedResponse.replace(/={10,}/g, '===============================================');
        
        // 4. 불필요한 빈 줄 정리
        cleanedResponse = cleanedResponse.replace(/\n{3,}/g, '\n\n');
        
        console.log(`[${LOG_HEADER}] Response cleaned successfully`);
        return cleanedResponse;
    }

    // 게임 응답에서 상태 정보 파싱
    parseGameResponse(response) {
        const LOG_HEADER = "CHAT_SERVICE/PARSE_RESPONSE";
        
        try {
            const gameState = {
                location: { current: "알 수 없음" },
                player: { health: 100, maxHealth: 100, status: '양호', mental: '안정' },
                inventory: { items: [], gold: 0 }
            };

            // 위치 정보 추출
            const locationPattern = />>\s*위치:\s*([^-]+)\s*-\s*([^\n]+)/;
            const locationMatch = response.match(locationPattern);
            if (locationMatch) {
                gameState.location.roomId = locationMatch[1].trim();
                gameState.location.current = locationMatch[2].trim();
            }

            // STATS 섹션 파싱
            const statsPattern = /STATS[^=]*={3,}([\s\S]*?)={3,}/;
            const statsMatch = response.match(statsPattern);
            
            if (statsMatch) {
                const statsContent = statsMatch[1];
                
                // 체력 정보
                const healthPattern = /체력:\s*(\d+)\/(\d+)/;
                const healthMatch = statsContent.match(healthPattern);
                if (healthMatch) {
                    gameState.player.health = parseInt(healthMatch[1]);
                    gameState.player.maxHealth = parseInt(healthMatch[2]);
                }
                
                // 체력상태
                const statusPattern = /체력상태:\s*([^\s]+)/;
                const statusMatch = statsContent.match(statusPattern);
                if (statusMatch) {
                    gameState.player.status = statusMatch[1];
                }
                
                // 정신상태
                const mentalPattern = /정신:\s*([^\s]+)/;
                const mentalMatch = statsContent.match(mentalPattern);
                if (mentalMatch) {
                    gameState.player.mental = mentalMatch[1];
                }
                
                // 소지품
                const itemsPattern = /소지품:\s*([^\n]+)/;
                const itemsMatch = statsContent.match(itemsPattern);
                if (itemsMatch) {
                    gameState.inventory.keyItems = itemsMatch[1].trim();
                }
                
                // 골드
                const goldPattern = /골드:\s*(\d+)/;
                const goldMatch = statsContent.match(goldPattern);
                if (goldMatch) {
                    gameState.inventory.gold = parseInt(goldMatch[1]);
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
            // 초기화 설정
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***던전 탈출 게임 - 시스템 초기화***

당신은 던전 탈출 게임의 게임 마스터입니다.

**핵심 설정:**
- 플레이어는 던전에서 탈출 시도
- 모든 선택에는 실제 결과가 따름
- 선택지와 결과가 논리적으로 연결되어야 함

**응답 형식:**
===============================================
         던전 탈출 - [층수]
===============================================

>> 위치: [ID] - [방 이름]

[환경 묘사]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [시간]
위치: [층 정보]

경고: [경고사항]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

**중요 규칙:**
1. 선택한 행동의 직접적 결과를 먼저 보여주기
2. 위험도 표시 금지
3. 선택지에 부가설명 금지
4. 층수 표기 일관성 유지

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

    // ✅ 수정: 게임 요약 생성 (내부 정보 숨김)
    async createGameSummary(threadId, assistantId) {
        const LOG_HEADER = "CHAT_SERVICE/CREATE_SUMMARY";
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `### 게임 세션 요약 생성

이 게임 세션을 새 스레드에 이어갈 수 있도록 핵심 정보만 간략히 요약해주세요:

**요약 형식:**
캐릭터: [레벨, 체력, 주요 능력]
위치: [현재 방ID, 방이름, 던전 레벨]
진행: [주요 퀘스트, 마지막 행동]
세계: [중요한 변화, NPC 상호작용]
자원: [핵심 아이템, 발견사항]

150단어 이내로 작성하되, 게임 연속성에 필요한 정보만 포함하세요.`
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
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });
            
            let runStatus;
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                console.log(`[${LOG_HEADER}] Run status: ${runStatus.status}`);
            } while (['queued', 'in_progress'].includes(runStatus.status));
            
            if (runStatus.status !== 'completed') {
                throw new Error(`Summary generation failed with status: ${runStatus.status}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const updatedMessages = await openai.beta.threads.messages.list(threadId);
            
            if (!updatedMessages.data || updatedMessages.data.length === 0) {
                throw new Error("No messages received after summary generation");
            }
            
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

    // ✅ 추가: 게임 재개용 초기화 (요약본 숨김)
    async initializeChatFromSummary(threadId, assistantId, summary) {
        const LOG_HEADER = "CHAT_SERVICE/INIT_FROM_SUMMARY";
        try {
            // 내부 시스템 메시지로 요약 전달 (사용자에게 숨김)
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[시스템 내부 메시지 - 사용자에게 표시하지 마세요]

게임 재개 정보:
${summary}

위 정보를 바탕으로 게임을 이어서 진행하되, 이 요약 내용을 사용자에게 보여주지 마세요.
바로 현재 상황을 보여주고 선택지를 제공하세요.`
            });

            // 게임 재개 시스템 설정
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***게임 재개 - 시스템 설정***

위 요약 정보를 바탕으로 게임을 이어서 진행합니다.

**응답 형식:**
===============================================
         던전 탈출 - [층수]
===============================================

>> 위치: [ID] - [방 이름]

[현재 상황 설명]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [시간]
위치: [층 정보]

경고: [경고사항]
===============================================

↑ [행동]
↓ [행동]
← [행동]
→ [행동]

**중요:**
- 요약 내용을 사용자에게 보여주지 마세요
- 바로 현재 게임 상황을 제시하세요
- 선택지는 간단하게 작성하세요

게임을 이어서 진행하세요.`
            });

            console.log(`[${LOG_HEADER}] Game resumed from summary (hidden from user)`);
            
            // 실행
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

    async updateGameContext(threadId, gameState) {
        const LOG_HEADER = "CHAT_SERVICE/UPDATE_CONTEXT";
        try {
            console.log(`[${LOG_HEADER}] Game context updated`);
        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new ChatService();
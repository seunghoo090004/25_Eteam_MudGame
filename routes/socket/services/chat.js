// routes/socket/services/chat.js - 최종 개선 버전

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
            
            try {
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `${safeMessage}\n\n[중요 지시사항] 반드시 새로운 상황이나 위치로 진행하세요. 동일한 방에 머무르지 말고 상황을 변화시키세요. 플레이어의 행동에 따른 실제 결과를 보여주세요.`
                });
            } catch (msgError) {
                console.error(`[${LOG_HEADER}] Failed to add message: ${msgError.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `${safeMessage}\n\n[중요] 게임을 진행시키고 새로운 상황을 만드세요.`
                });
            }

            // ✅ 수정: 개선된 게임 진행 시스템 메시지
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[게임 마스터 지시사항 - 필수 준수]

**현재 선택**: ${safeMessage}번

**반드시 실행해야 할 사항:**
1. 플레이어를 새로운 위치로 이동시키거나 상황을 크게 변화시키세요
2. 위치 ID를 변경하세요 (예: 01 → 02, 03 등)
3. 층수는 스토리에 맞게 조정 (같은 층의 다른 특수한 방으로 이동 가능)
4. 완전히 새로운 환경 설명을 작성하세요
5. 시간은 실제 플레이 시간에 맞춰 자연스럽게 증가시키세요
6. 선택지는 간단하게 작성하세요 (예: "↑ 문을 열어보며")

**응답 형식:**
===============================================
         던전 탈출 - [층수 정보]
===============================================

>> 위치: [새로운 ID] - [특수한 방 이름]

[환경 묘사]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [자연스러운 시간]
위치: [층 정보]

경고: [간단한 경고]

===============================================

↑ [간단한 행동]
↓ [간단한 행동]
← [간단한 행동]
→ [간단한 행동]

**금지사항:**
- 동일한 방에서 단순 탐색만 반복
- 위험도 표시 (위험도: 극한 등)
- 선택지에 "- 부가설명" 추가
- 이전과 같은 위치 ID 사용

지금 즉시 새로운 상황으로 진행하세요!`
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
                
                // 응답 검증 및 재시도
                if (this.isRepeatResponse(response)) {
                    console.log(`[${LOG_HEADER}] Detected repeat response, forcing retry...`);
                    return await this.forceProgressMessage(threadId, assistantId, safeMessage);
                }
                
                // ✅ 수정: 응답 정리 (위험도 제거, 선택지 간소화)
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

    // 반복 응답 감지
    isRepeatResponse(response) {
        const locationMatch = response.match(/위치:\s*(\w+)\s*-\s*([^=\n]+)/);
        if (locationMatch) {
            const roomId = locationMatch[1].trim();
            const roomName = locationMatch[2].trim();
            
            if (roomId === "01" || roomName.includes("감옥")) {
                console.log('Repeat response detected:', roomId, roomName);
                return true;
            }
        }
        return false;
    }

    // 강제 진행 메시지
    async forceProgressMessage(threadId, assistantId, originalMessage) {
        const LOG_HEADER = "CHAT_SERVICE/FORCE_PROGRESS";
        
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `[긴급 시스템 명령 - 즉시 실행]

게임이 정체되었습니다. 지금 즉시:

1. 플레이어를 다음 위치로 이동: "02 - 연금술 실험실" 또는 "03 - 고문실" 등
2. 완전히 새로운 환경 생성
3. 새로운 위험 요소 추가
4. 간단한 선택지 제공 (부가설명 없이)

선택 ${originalMessage}번의 결과로 플레이어가 실제로 이동했습니다.
새로운 상황을 지금 즉시 생성하세요!`
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
                const messages = await openai.beta.threads.messages.list(threadId);
                const response = messages.data[0].content[0].text.value;
                return this.cleanResponse(response);
            }

            throw new Error('Force progress failed');

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message}`);
            throw e;
        }
    }

    // ✅ 추가: 응답 정리 함수 (위험도 제거, 선택지 간소화)
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

            // 위치 정보 추출: >> 위치: [ID] - [방이름]
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
            // ✅ 수정: 개선된 초기화 설정
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: `***던전 탈출 게임 - 최종 시스템 초기화***

당신은 극도로 위험한 던전 탈출 게임의 게임 마스터입니다.

**핵심 설정:**
- 플레이어는 던전 최하층 감옥에서 시작
- 목표: 던전 탈출 (극도로 어려움)
- 모든 선택에는 실제 위험이 따름
- 체력 0 = 사망
- 분위기: 어둡고 위험한 서바이벌 호러

**필수 응답 형식:**

===============================================
         던전 탈출 - [층수]
===============================================

>> 위치: [ID] - [특수한 방 이름]

[몰입감 있는 환경 묘사 2-3문장]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [자연스러운 시간]
위치: [층 정보]

경고: [간단한 경고]

===============================================

↑ [간단한 행동]
↓ [간단한 행동]
← [간단한 행동]  
→ [간단한 행동]

**중요 규칙:**
1. 위험도 표시 금지 (위험도: 극한 등)
2. 선택지에 "- 부가설명" 금지
3. 화살표 기호 사용 필수
4. 모든 선택에 실제 결과
5. 한국어로만 작성
6. 플레이어 선택 시 반드시 새로운 위치로 이동시키기
7. 층수는 스토리에 맞게 자유롭게 조정
8. 시간은 실제 플레이 시간에 맞춰 자연스럽게

지금 게임을 시작하세요. 플레이어가 차가운 돌 감옥에서 깨어납니다.`
            });

            console.log(`[${LOG_HEADER}] Final system initialized with improved format`);
            
            // 초기 응답 받기
            try {
                return await this.sendMessage(threadId, assistantId, "게임을 시작합니다. 새로운 위치로 진행해주세요.");
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

    async updateGameContext(threadId, gameState) {
        const LOG_HEADER = "CHAT_SERVICE/UPDATE_CONTEXT";
        try {
            console.log(`[${LOG_HEADER}] Game context updated (no state update box)`);

        } catch (e) {
            console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
            throw e;
        }
    }
}

module.exports = new ChatService();
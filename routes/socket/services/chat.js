// routes/socket/services/chat.js - 레퍼런스 패턴 적용

const { pool } = require('../../../config/database');
const openai = require('../../../config/openai');
const my_reqinfo = require('../../../utils/reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

class ChatService {
    
    //============================================================================================
    async sendMessage(threadId, assistantId, message) {
    //============================================================================================
        const LOG_HEADER_TITLE = "SEND_MESSAGE";
        const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] AssistantId[" + my_reqinfo.maskId(assistantId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_openai_runs_check = -2;
        const catch_openai_message_create = -3;
        const catch_openai_run_create = -4;
        const catch_openai_wait_completion = -5;
        const catch_openai_messages_list = -6;
        const catch_response_processing = -7;
        
        const EXT_data = { 
            threadId: my_reqinfo.maskId(threadId), 
            assistantId: my_reqinfo.maskId(assistantId),
            messageLength: message?.length || 0
        };
        
        try {
            // 입력값 검증
            try {
                if (!threadId || !assistantId || !message) {
                    throw new Error("Required parameters missing");
                }
                
                // 메시지를 문자열로 변환 (숫자나 다른 타입도 허용)
                if (typeof message !== 'string') {
                    message = String(message);
                }
                
                // 빈 문자열 체크
                if (message.trim() === '') {
                    throw new Error("Message cannot be empty");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 현재 실행 중인 run 확인 및 완료 대기
            try {
                const runs = await openai.beta.threads.runs.list(threadId);
                const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
                
                if (activeRun) {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Waiting for previous run to complete: " + activeRun.id);
                    let runStatus;
                    do {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Run status: " + runStatus.status);
                    } while (['in_progress', 'queued'].includes(runStatus.status));
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_runs_check);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_runs_check)",
                    value: catch_openai_runs_check,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 메시지 추가
            try {
                const safeMessage = typeof message === 'string' ? message : String(message);
                
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: safeMessage
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_message_create);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_message_create)",
                    value: catch_openai_message_create,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                // 재시도 로직
                try {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Retrying message creation after 10 seconds");
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    await openai.beta.threads.messages.create(threadId, {
                        role: "user",
                        content: safeMessage
                    });
                } catch (retryError) {
                    throw new Error("Message creation failed after retry: " + retryError.message);
                }
            }

            // 최종 게임 형식 지침 추가
            try {
                await openai.beta.threads.messages.create(threadId, {
                    role: "user",
                    content: `[FINAL SYSTEM DIRECTIVE - NATURAL CHOICE FORMAT]

**던전 탈출 게임 - 자연스러운 선택지 형식**

반드시 다음 형식으로 응답하세요:

===============================================
         던전 탈출 - 지하 [층수]층
===============================================

>> 위치: [방ID] - [방이름]

[환경 묘사 - 2-3문장으로 몰입감 있게]
[감각적 세부사항과 즉각적 위험 포함]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템 목록]
골드: [수량]  시간: [게임시간]
위치: [층 정보]

위험도: [낮음/중간/높음/매우높음]
경고: [즉각적 위험 또는 특별한 상태]

===============================================

**중요: 선택지는 반드시 이 형식으로!**

↑ [간단한 행동] - [자연스러운 느낌 표현]
↓ [간단한 행동] - [자연스러운 느낌 표현]
← [간단한 행동] - [자연스러운 느낌 표현]
→ [간단한 행동] - [자연스러운 느낌 표현]

지금부터 이 형식으로만 응답하세요.`
                });
            } catch (e) {
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + " System directive error:", e.message);
                // 시스템 지침 실패는 경고로만 처리하고 계속 진행
            }

            // 새로운 run 시작
            let run;
            try {
                run = await openai.beta.threads.runs.create(threadId, {
                    assistant_id: assistantId
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_run_create);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_run_create)",
                    value: catch_openai_run_create,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                // 재시도 로직
                if (e.message.includes('while a run is active')) {
                    try {
                        console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Run already active, waiting 15 seconds and retrying");
                        await new Promise(resolve => setTimeout(resolve, 15000));
                        run = await openai.beta.threads.runs.create(threadId, {
                            assistant_id: assistantId
                        });
                    } catch (retryError) {
                        throw new Error("Run creation failed after retry: " + retryError.message);
                    }
                } else {
                    throw new Error(ret_data.value_ext2);
                }
            }

            // 실행 완료 대기
            let runStatus;
            try {
                runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                const startTime = Date.now();
                const timeout = 120000; // 2분
                
                while (['queued', 'in_progress'].includes(runStatus.status)) {
                    if (Date.now() - startTime > timeout) {
                        throw new Error("Response timeout");
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Run status: " + runStatus.status);
                }

                if (runStatus.status === 'failed') {
                    throw new Error(runStatus.last_error?.message || 'Assistant run failed');
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_wait_completion);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_wait_completion)",
                    value: catch_openai_wait_completion,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 응답 메시지 가져오기
            let response;
            try {
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
                    
                    response = firstMessage.content[0].text.value;
                } else {
                    throw new Error(`Unexpected run status: ${runStatus.status}`);
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_messages_list);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_messages_list)",
                    value: catch_openai_messages_list,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
                
            // 응답 후처리
            let processedResponse;
            try {
                processedResponse = this.processNaturalChoices(response);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_response_processing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(response_processing)",
                    value: catch_response_processing,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                // 후처리 실패 시 원본 응답 사용
                processedResponse = response;
            }
            
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    response: processedResponse,
                    responseLength: processedResponse.length,
                    runId: run.id,
                    runStatus: runStatus.status
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { 
                    responseLength: processedResponse.length,
                    runId: run.id,
                    runStatus: runStatus.status
                }
            }, null, 2));
            
            return processedResponse;

        } catch (e) {
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    processNaturalChoices(response) {
    //============================================================================================
        const LOG_HEADER_TITLE = "PROCESS_NATURAL_CHOICES";
        const LOG_HEADER = "ChatService --> " + LOG_HEADER_TITLE;
        
        const catch_processing = -1;
        
        try {
            let processedResponse = response;
            
            // 기존 형식을 자연스러운 형식으로 변환
            const oldChoicePattern = /(\[(?:위로|아래로|왼쪽|오른쪽)\]|↑|↓|←|→)\s*([^-\n]+)\s*[-–]\s*\(([^)]+)\)/g;
            
            processedResponse = processedResponse.replace(oldChoicePattern, (match, direction, action, risk) => {
                // 방향 기호로 통일
                let arrow;
                if (direction.includes('위로') || direction === '↑') arrow = '↑';
                else if (direction.includes('아래로') || direction === '↓') arrow = '↓';
                else if (direction.includes('왼쪽') || direction === '←') arrow = '←';
                else if (direction.includes('오른쪽') || direction === '→') arrow = '→';
                
                // 행동 정리
                let cleanAction = action.trim();
                
                // 위험도를 자연스러운 표현으로 변환
                let naturalFeeling;
                const riskLower = risk.toLowerCase();
                
                if (riskLower.includes('안전') || riskLower.includes('무해')) {
                    naturalFeeling = Math.random() > 0.5 ? '안전해 보임' : '무난할 듯';
                } else if (riskLower.includes('주의') || riskLower.includes('조심')) {
                    naturalFeeling = Math.random() > 0.5 ? '신중하게' : '조심스럽게';
                } else if (riskLower.includes('위험') && !riskLower.includes('매우')) {
                    naturalFeeling = Math.random() > 0.5 ? '위험한 느낌' : '불안한 기운';
                } else if (riskLower.includes('매우') || riskLower.includes('치명') || riskLower.includes('극도')) {
                    naturalFeeling = Math.random() > 0.5 ? '매우 위험할 것 같음' : '용기가 필요함';
                } else {
                    naturalFeeling = '살펴보며';
                }
                
                return `${arrow} ${cleanAction} - ${naturalFeeling}`;
            });
            
            // 괄호 형식 제거
            processedResponse = processedResponse.replace(/\(위험\)|(\(안전\))|(\(주의\))|(\(매우위험\))/g, '');
            
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Converted to natural choice format");
            return processedResponse;
            
        } catch (e) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(processing_error)",
                value: catch_processing,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data: { responseLength: response?.length || 0 }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            return response; // 실패 시 원본 반환
        }
    }

    //============================================================================================
    parseGameResponse(response) {
    //============================================================================================
        const LOG_HEADER_TITLE = "PARSE_GAME_RESPONSE";
        const LOG_HEADER = "ChatService --> " + LOG_HEADER_TITLE;
        
        const catch_parsing = -1;
        
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

            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Parsed game state successfully");
            return gameState;

        } catch (e) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(parsing_error)",
                value: catch_parsing,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data: { responseLength: response?.length || 0 }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            return null;
        }
    }

    //============================================================================================
    async initializeChat(threadId, assistantId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "INITIALIZE_CHAT";
        const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] AssistantId[" + my_reqinfo.maskId(assistantId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_openai_message_create = -2;
        const catch_send_message = -3;
        
        const EXT_data = { 
            threadId: my_reqinfo.maskId(threadId), 
            assistantId: my_reqinfo.maskId(assistantId)
        };
        
        try {
            // 입력값 검증
            try {
                if (!threadId || !assistantId) {
                    throw new Error("ThreadId and AssistantId are required");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 최종 초기화 설정
            try {
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
         던전 탈출 - 지하 [층]층
===============================================

>> 위치: [ID] - [방이름]

[몰입감 있는 환경 묘사 2-3문장]

STATS ================================
체력: [현재]/[최대]  체력상태: [상태]  정신: [상태]
소지품: [아이템들]
골드: [수량]  시간: [게임시간]
위치: [층 정보]

위험도: [레벨]  경고: [즉각적 위험]

===============================================

**선택지 형식 (반드시 지켜야 함):**
↑ [간단한 행동] - [자연스러운 느낌]
↓ [간단한 행동] - [자연스러운 느낌]
← [간단한 행동] - [자연스러운 느낌]
→ [간단한 행동] - [자연스러운 느낌]

지금 게임을 시작하세요. 플레이어가 차가운 돌 감옥에서 깨어납니다.`
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_message_create);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_message_create)",
                    value: catch_openai_message_create,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Final system initialized with natural choices");
            
            // 초기 응답 받기
            let initialResponse;
            try {
                initialResponse = await this.sendMessage(threadId, assistantId, "게임을 시작합니다. 자연스러운 선택지로 진행해주세요.");
            } catch (e) {
                ret_status = fail_status + (-1 * catch_send_message);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(send_message)",
                    value: catch_send_message,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                
                // 재시도
                try {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Retrying initial message after 10 seconds");
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    initialResponse = await this.sendMessage(threadId, assistantId, "게임을 시작합니다.");
                } catch (retryError) {
                    throw new Error("Initial message failed after retry: " + retryError.message);
                }
            }

            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    initialized: true,
                    initialResponse: initialResponse,
                    responseLength: initialResponse?.length || 0
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { initialized: true, responseLength: initialResponse?.length || 0 }
            }, null, 2));
            
            return initialResponse;

        } catch (e) {
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    async getMessageHistory(threadId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "GET_MESSAGE_HISTORY";
        const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_openai_messages_list = -2;
        const catch_data_processing = -3;
        
        const EXT_data = { threadId: my_reqinfo.maskId(threadId) };
        
        try {
            // 입력값 검증
            try {
                if (!threadId) {
                    throw new Error("ThreadId is required");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 메시지 목록 가져오기
            let messages;
            try {
                messages = await openai.beta.threads.messages.list(threadId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_messages_list);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_messages_list)",
                    value: catch_openai_messages_list,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 메시지 데이터 처리
            let history;
            try {
                history = messages.data
                    .map(msg => ({
                        role: msg.role,
                        content: msg.content[0].text.value,
                        created_at: new Date(msg.created_at * 1000)
                    }))
                    .sort((a, b) => a.created_at - b.created_at);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_data_processing);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(data_processing)",
                    value: catch_data_processing,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            ret_data = {
                code: "result",
                value: history.length,
                value_ext1: ret_status,
                value_ext2: history,
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: `${history.length} messages retrieved`
            }, null, 2));
            
            return history;

        } catch (e) {
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    async createGameSummary(threadId, assistantId) {
    //============================================================================================
        const LOG_HEADER_TITLE = "CREATE_GAME_SUMMARY";
        const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] AssistantId[" + my_reqinfo.maskId(assistantId) + "] --> " + LOG_HEADER_TITLE;
        
        const fail_status = 500;
        let ret_status = 200;
        let ret_data;
        
        const catch_input_validation = -1;
        const catch_openai_message_create = -2;
        const catch_openai_runs_check = -3;
        const catch_openai_run_create = -4;
        const catch_openai_wait_completion = -5;
        const catch_openai_messages_list = -6;
        
        const EXT_data = { 
            threadId: my_reqinfo.maskId(threadId), 
            assistantId: my_reqinfo.maskId(assistantId)
        };
        
        try {
            // 입력값 검증
            try {
                if (!threadId || !assistantId) {
                    throw new Error("ThreadId and AssistantId are required");
                }
            } catch (e) {
                ret_status = fail_status + (-1 * catch_input_validation);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(input_validation)",
                    value: catch_input_validation,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 요약 요청 메시지 추가
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
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_message_create);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_message_create)",
                    value: catch_openai_message_create,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }

            // 기존 실행 중인 프로세스 대기
            try {
                const runs = await openai.beta.threads.runs.list(threadId);
                const activeRun = runs.data.find(run => ['in_progress', 'queued'].includes(run.status));
                
                if (activeRun) {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " 기존 실행 중인 프로세스 대기: " + activeRun.id);
                    let runStatus;
                    do {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        runStatus = await openai.beta.threads.runs.retrieve(threadId, activeRun.id);
                    } while (['in_progress', 'queued'].includes(runStatus.status));
                }
                
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_runs_check);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_runs_check)",
                    value: catch_openai_runs_check,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 요약 생성 실행
            let run;
            try {
                run = await openai.beta.threads.runs.create(threadId, {
                    assistant_id: assistantId
                });
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_run_create);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_run_create)",
                    value: catch_openai_run_create,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 실행 완료 대기
            let runStatus;
            try {
                do {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    runStatus = await openai.beta.threads.runs.retrieve(threadId, run.id);
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Run status: " + runStatus.status);
                } while (['queued', 'in_progress'].includes(runStatus.status));
                
                if (runStatus.status !== 'completed') {
                    throw new Error(`Summary generation failed with status: ${runStatus.status}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_wait_completion);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_wait_completion)",
                    value: catch_openai_wait_completion,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            // 요약 내용 가져오기
            let summary;
            try {
                const updatedMessages = await openai.beta.threads.messages.list(threadId);
                
                if (!updatedMessages.data || updatedMessages.data.length === 0) {
                    throw new Error("No messages received after summary generation");
                }
                
                const firstMessage = updatedMessages.data[0];
                if (!firstMessage.content || !firstMessage.content[0] || !firstMessage.content[0].text) {
                    throw new Error("Invalid message format received");
                }
                
                summary = firstMessage.content[0].text.value;
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_messages_list);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_messages_list)",
                    value: catch_openai_messages_list,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            ret_data = {
                code: "result",
                value: 1,
                value_ext1: ret_status,
                value_ext2: {
                    summary: summary,
                    summaryLength: summary.length,
                    runId: run.id,
                    runStatus: runStatus.status
                },
                EXT_data
            };
            
            console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
                ...ret_data,
                value_ext2: { 
                    summaryLength: summary.length,
                    runId: run.id,
                    runStatus: runStatus.status
                }
            }, null, 2));
            
            return summary;
            
        } catch (e) {
            if (ret_status === 200) {
                ret_status = fail_status;
                ret_data = {
                    code: LOG_HEADER_TITLE + "(unexpected_error)",
                    value: -999,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            }
            throw e;
        }
    }

    //============================================================================================
    async updateGameContext(threadId, gameState) {
    //============================================================================================
        const LOG_HEADER_TITLE = "UPDATE_GAME_CONTEXT";
        const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] --> " + LOG_HEADER_TITLE;
        
        try {
            // Game State Update 메시지는 더 이상 생성하지 않음 (기존 로직 유지)
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Game context updated (no state update box)");

        } catch (e) {
            const error_data = {
                code: LOG_HEADER_TITLE + "(context_update_error)",
                value: -1,
                value_ext1: 500,
                value_ext2: e.message,
                EXT_data: { threadId: my_reqinfo.maskId(threadId) }
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(error_data, null, 2));
            throw e;
        }
    }
}

module.exports = new ChatService();
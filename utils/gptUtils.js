// utils/gptUtils.js - 조건부 이미지 생성 버전

const openai = require('../config/openai');
require('dotenv').config();

// 환경변수에서 설정 읽기
const IMAGE_ENABLED = process.env.IMAGE_GENERATION_ENABLED !== 'false';
const MIN_INTERVAL_BETWEEN_IMAGES = parseInt(process.env.IMAGE_GENERATION_INTERVAL) || 5000;
const MAX_RETRIES = parseInt(process.env.IMAGE_GENERATION_MAX_RETRIES) || 3;
const IMAGE_QUALITY = process.env.IMAGE_GENERATION_QUALITY || 'medium';

// Rate limiting 변수
let lastImageGenerationTime = 0;

//============================================================================================
async function sendMessageToGPT(message, assistantId, threadId) {
//============================================================================================
    const LOG_HEADER_TITLE = "GPT_SEND_MESSAGE";
    const LOG_HEADER = "Message[" + message.substring(0, 50) + "...] --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    let ret_status = 200;
    let ret_data;
    
    try {
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });
        
        ret_data = {
            threadId: threadId,
            runId: run.id
        };

    } catch (e) {
        ret_status = 501;
        console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
        throw e;
    }

    console.log(LOG_SUCC_HEADER + LOG_HEADER + "status(" + ret_status + ")");
    return ret_data;
}

//============================================================================================
async function waitForCompletion(threadId, runId) {
//============================================================================================
    const LOG_HEADER_TITLE = "GPT_WAIT_COMPLETION";
    const LOG_HEADER = "ThreadId[" + threadId + "] RunId[" + runId + "] --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    let ret_status = 200;
    let runStatus;
    
    try {
        runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        
        while (runStatus.status === 'in_progress') {
            console.log(LOG_SUCC_HEADER + LOG_HEADER + "Current status: " + runStatus.status);
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        }

    } catch (e) {
        ret_status = 501;
        console.error(LOG_ERR_HEADER + LOG_HEADER + "getBODY::status(" + ret_status + ") ==> " + e);
        throw e;
    }

    console.log(LOG_SUCC_HEADER + LOG_HEADER + "Final status: " + runStatus.status);
    return runStatus;
}

//============================================================================================
async function generateImageFromText(prompt, options = {}) {
//============================================================================================
    const LOG_HEADER_TITLE = "GPT_IMAGE_GENERATION";
    const LOG_HEADER = "Prompt[" + prompt.substring(0, 50) + "...] --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    try {
        // 이미지 생성이 비활성화된 경우
        if (!IMAGE_ENABLED) {
            console.log(LOG_SUCC_HEADER + LOG_HEADER + " Image generation is disabled");
            return {
                success: false,
                error: 'Image generation is disabled',
                error_type: 'disabled'
            };
        }
        
        // Rate limiting 체크
        const now = Date.now();
        const timeSinceLastGeneration = now - lastImageGenerationTime;
        
        if (timeSinceLastGeneration < MIN_INTERVAL_BETWEEN_IMAGES) {
            const waitTime = MIN_INTERVAL_BETWEEN_IMAGES - timeSinceLastGeneration;
            console.log(LOG_SUCC_HEADER + LOG_HEADER + ` Waiting ${waitTime}ms for rate limit...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " Starting image generation with quality: " + IMAGE_QUALITY);
        
        // 재시도 로직
        let retries = MAX_RETRIES;
        let lastError;
        
        while (retries > 0) {
            try {
                // gpt-image-1 사용
                const response = await openai.images.generate({
                    model: "gpt-image-1",
                    prompt: prompt,
                    n: 1,
                    size: "1024x1024",
                    quality: IMAGE_QUALITY  // 환경변수 사용
                });
                
                lastImageGenerationTime = Date.now();
                
                const imageData = response.data[0];
                let imageBase64 = null;
                
                // URL 응답인 경우 base64로 변환
                if (imageData.url) {
                    try {
                        const axios = require('axios');
                        const imageResponse = await axios.get(imageData.url, {
                            responseType: 'arraybuffer',
                            timeout: 30000 // 30초 타임아웃
                        });
                        imageBase64 = Buffer.from(imageResponse.data, 'binary').toString('base64');
                    } catch (fetchError) {
                        console.error(LOG_ERR_HEADER + LOG_HEADER + " URL fetch error: " + fetchError.message);
                        throw new Error('Failed to fetch image from URL');
                    }
                } else if (imageData.b64_json) {
                    imageBase64 = imageData.b64_json;
                } else {
                    throw new Error('No image data received');
                }
                
                console.log(LOG_SUCC_HEADER + LOG_HEADER + " Image generation completed successfully");
                
                return {
                    success: true,
                    image_base64: imageBase64,
                    revised_prompt: imageData.revised_prompt || prompt,
                    format: 'png'
                };
                
            } catch (e) {
                lastError = e;
                retries--;
                
                // Rate limit 오류인 경우
                if (e.response && (e.response.status === 429 || e.response.status === 503)) {
                    const waitTime = e.response.status === 429 ? 60000 : 10000; // 429면 60초, 503이면 10초
                    console.error(LOG_ERR_HEADER + LOG_HEADER + ` Rate limited, waiting ${waitTime/1000} seconds... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else if (retries > 0) {
                    console.error(LOG_ERR_HEADER + LOG_HEADER + ` Error occurred, retrying... (${retries} retries left)`);
                    await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
                } else {
                    break;
                }
            }
        }
        
        // 모든 재시도 실패
        console.error(LOG_ERR_HEADER + LOG_HEADER + " All retries failed: " + (lastError.message || lastError));
        
        return {
            success: false,
            error: lastError.message || 'Image generation failed after retries',
            error_type: lastError.response?.status === 429 ? 'rate_limit' : 'unknown_error'
        };
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " Error: " + (e.message || e));
        
        return {
            success: false,
            error: e.message || 'Image generation failed',
            error_type: e.response?.status === 429 ? 'rate_limit' : 'unknown_error'
        };
    }
}

//============================================================================================
function extractImageKeywords(assistantResponse, gameData = null) {
//============================================================================================
    const LOG_HEADER_TITLE = "EXTRACT_SCENE_DESCRIPTION";
    const LOG_HEADER = LOG_HEADER_TITLE;
    
    try {
        // 이미지 생성이 비활성화된 경우
        if (!IMAGE_ENABLED) {
            return {
                shouldGenerate: false,
                sceneDescription: '',
                response: assistantResponse,
                reason: 'disabled'
            };
        }
        
        // 무조건 생성해야 하는 특별한 트리거들
        const alwaysGenerateTriggers = [
            '게임시작', '차원 감옥 시작',  // 게임 시작
            '당신은 죽었습니다', '사망',    // 사망
            '탈출 성공', '축하합니다'       // 탈출
        ];
        
        // 특별 트리거 체크
        const hasSpecialTrigger = alwaysGenerateTriggers.some(trigger => 
            assistantResponse.includes(trigger)
        );
        
        if (hasSpecialTrigger) {
            console.log(`[${LOG_HEADER}] Special trigger detected - generating image`);
            return {
                shouldGenerate: true,
                sceneDescription: extractSceneDescription(assistantResponse),
                response: assistantResponse,
                reason: 'special_trigger'
            };
        }
        
        // 새로운 발견 체크
        const newDiscoveries = extractNewDiscoveries(assistantResponse, gameData);
        
        if (newDiscoveries.length > 0) {
            console.log(`[${LOG_HEADER}] New discoveries detected: ${newDiscoveries.join(', ')}`);
            return {
                shouldGenerate: true,
                sceneDescription: extractSceneDescription(assistantResponse),
                response: assistantResponse,
                reason: 'new_discovery',
                discoveries: newDiscoveries
            };
        }
        
        // 발견이 없으면 이미지 생성하지 않음
        console.log(`[${LOG_HEADER}] No new discoveries - skipping image generation`);
        return {
            shouldGenerate: false,
            sceneDescription: '',
            response: assistantResponse,
            reason: 'no_new_discovery'
        };
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return {
            shouldGenerate: false,
            sceneDescription: '',
            response: assistantResponse,
            reason: 'error'
        };
    }
}

//============================================================================================
function extractNewDiscoveries(response, gameData) {
//============================================================================================
    const LOG_HEADER = "EXTRACT_NEW_DISCOVERIES";
    
    try {
        const newDiscoveries = [];
        const existingDiscoveries = gameData?.discoveries || [];
        
        // 몬스터 조우 패턴
        const monsterPatterns = [
            /(\S+)\s*조우/g,
            /조우.*?(\S+)/g
        ];
        
        // 아이템 발견 패턴  
        const itemPatterns = [
            /(\S+)\s*발견/g,
            /발견.*?(\S+)/g
        ];
        
        // 몬스터 체크
        for (const pattern of monsterPatterns) {
            const matches = [...response.matchAll(pattern)];
            for (const match of matches) {
                const monster = match[1];
                const discovery = `${monster} 조우`;
                if (monster && !existingDiscoveries.includes(discovery) && !newDiscoveries.includes(discovery)) {
                    // 통계 섹션이나 선택지가 아닌지 확인
                    if (!monster.includes('↑') && !monster.includes('↓') && 
                        !monster.includes('←') && !monster.includes('→') &&
                        !monster.includes(':') && !monster.includes('=')) {
                        newDiscoveries.push(discovery);
                    }
                }
            }
        }
        
        // 아이템 체크
        for (const pattern of itemPatterns) {
            const matches = [...response.matchAll(pattern)];
            for (const match of matches) {
                const item = match[1];
                const discovery = `${item} 발견`;
                if (item && !existingDiscoveries.includes(discovery) && !newDiscoveries.includes(discovery)) {
                    // 통계 섹션이나 선택지가 아닌지 확인
                    if (!item.includes('↑') && !item.includes('↓') && 
                        !item.includes('←') && !item.includes('→') &&
                        !item.includes(':') && !item.includes('=') &&
                        item !== '없음' && item !== '발견') {
                        newDiscoveries.push(discovery);
                    }
                }
            }
        }
        
        console.log(`[${LOG_HEADER}] Found discoveries: ${newDiscoveries.join(', ')}`);
        return newDiscoveries;
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message}`);
        return [];
    }
}

//============================================================================================
function extractSceneDescription(assistantResponse) {
//============================================================================================
    const LOG_HEADER = "EXTRACT_SCENE_DESC";
    
    try {
        let sceneDescription = assistantResponse;
        
        // 통계 섹션 및 선택지 제거
        const patterns = [
            /통계[\s\S]*/,
            /={3,}[\s\S]*/,
            /사망 원인:[\s\S]*/,
            /다음 행동[\s\S]*/,
            /[↑↓←→][\s\S]*/,
            /\n\s*선택:/,
            /당신은 죽었습니다\.[\s\S]*/
        ];
        
        for (const pattern of patterns) {
            const match = sceneDescription.match(pattern);
            if (match) {
                sceneDescription = sceneDescription.substring(0, match.index).trim();
            }
        }
        
        // 첫 문단만 추출 (첫 2-3문장)
        const sentences = sceneDescription.split(/[.!?]\s+/);
        if (sentences.length > 3) {
            sceneDescription = sentences.slice(0, 3).join('. ') + '.';
        }
        
        console.log(`[${LOG_HEADER}] Extracted scene: ${sceneDescription.substring(0, 100)}...`);
        return sceneDescription;
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message}`);
        return assistantResponse.substring(0, 150);
    }
}

//============================================================================================
function createImagePrompt(sceneData, gameContext) {
//============================================================================================
    const LOG_HEADER_TITLE = "CREATE_IMAGE_PROMPT";
    const LOG_HEADER = LOG_HEADER_TITLE;
    
    try {
        let basePrompt = "양피지에 그려진 연필 스케치, ";
        
        // 장면 설명 추가 (간결하게)
        if (sceneData.sceneDescription) {
            // 불필요한 공백과 줄바꿈 제거
            const cleanedScene = sceneData.sceneDescription
                .replace(/\n/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 150); // 최대 150자로 제한
            
            // 장면 + 뒷모습 강조
            basePrompt += cleanedScene + " 앞에서 뒤돌아선 모험가의 뒷모습, ";
        } else {
            basePrompt += "던전 복도를 탐험하는 모험가의 뒷모습, ";
        }
        
        // 공통 스타일 - 뒷모습 강조
        basePrompt += "흑백 드로잉, 종이 가장자리 말린 고서 스타일, 중세 모험가 일기장 일러스트, 인물은 뒤를 보고 있음, 얼굴이 보이지 않는 뒷모습";
        
        console.log(`[${LOG_HEADER}] Final prompt: ${basePrompt}`);
        
        return basePrompt;
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return "양피지에 그려진 연필 스케치, 던전을 탐험하는 모험가의 뒷모습, 흑백 드로잉, 종이 가장자리 말린 고서 스타일, 중세 모험가 일기장 일러스트";
    }
}

module.exports = { 
    sendMessageToGPT, 
    generateImageFromText, 
    extractImageKeywords, 
    createImagePrompt,
    waitForCompletion  // 추가
};
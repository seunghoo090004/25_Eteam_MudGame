// utils/gptUtils.js - 환경변수 적용 버전

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
function extractImageKeywords(assistantResponse) {
//============================================================================================
    const LOG_HEADER_TITLE = "EXTRACT_SCENE_DESCRIPTION";
    const LOG_HEADER = LOG_HEADER_TITLE;
    
    try {
        // 이미지 생성이 비활성화된 경우
        if (!IMAGE_ENABLED) {
            return {
                shouldGenerate: false,
                sceneDescription: '',
                response: assistantResponse
            };
        }
        
        let sceneDescription = assistantResponse;
        
        // 통계 섹션 및 선택지 제거
        // "통계", "====", "사망 원인:", "다음 행동", "↑", "→" 등이 나타나기 전까지만 추출
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
        
        return {
            shouldGenerate: true,
            sceneDescription: sceneDescription,
            response: assistantResponse
        };
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return {
            shouldGenerate: false,
            sceneDescription: '',
            response: assistantResponse
        };
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
    createImagePrompt 
};
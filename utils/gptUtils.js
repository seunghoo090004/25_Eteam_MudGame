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
        
        // 통계 섹션 이전의 상황 묘사만 추출
        let sceneDescription = assistantResponse;
        
        // "통계" 또는 "====" 이전까지만 추출
        const statsMatch = sceneDescription.match(/(.*?)(?=통계|={3,})/s);
        if (statsMatch) {
            sceneDescription = statsMatch[1].trim();
        }
        
        console.log(`[${LOG_HEADER}] Extracted scene description: ${sceneDescription.substring(0, 100)}...`);
        
        return {
            shouldGenerate: true,
            sceneDescription: sceneDescription,
            response: assistantResponse
        };
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error extracting scene: ${e.message || e}`);
        return {
            shouldGenerate: false,
            sceneDescription: assistantResponse,
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
        let basePrompt = "양피지에 그려진 연필 스케치, 흑백 드로잉, 종이 가장자리가 말린 고서 스타일, 중세 모험가 탐험 일기장 일러스트 느낌. ";
        
        // 추출된 상황 묘사를 그대로 사용
        if (sceneData.sceneDescription) {
            basePrompt += sceneData.sceneDescription;
        } else {
            basePrompt += "어둡고 신비로운 던전 복도, 모험가의 탐험 장면";
        }
        
        console.log(`[${LOG_HEADER}] Generated prompt: ${basePrompt.substring(0, 100)}...`);
        
        return basePrompt;
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error creating prompt: ${e.message || e}`);
        return "양피지에 그려진 연필 스케치, 흑백 드로잉, 중세 던전 탐험 장면";
    }
}

module.exports = { 
    sendMessageToGPT, 
    generateImageFromText, 
    extractImageKeywords, 
    createImagePrompt 
};
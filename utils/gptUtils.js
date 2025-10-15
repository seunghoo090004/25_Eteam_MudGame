// utils/gptUtils.js - gpt-image-1 정식 버전

const openai = require('../config/openai');
require('dotenv').config();

// 환경변수에서 설정 읽기
const IMAGE_ENABLED = process.env.IMAGE_GENERATION_ENABLED !== 'false';
const MIN_INTERVAL_BETWEEN_IMAGES = parseInt(process.env.IMAGE_GENERATION_INTERVAL) || 5000;
const MAX_RETRIES = parseInt(process.env.IMAGE_GENERATION_MAX_RETRIES) || 3;
const IMAGE_QUALITY = process.env.IMAGE_GENERATION_QUALITY || 'standard'; // ✅ gpt-image-1은 'standard' 또는 'high'

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
    
    const startTime = Date.now();
    
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
        
        // ✅ gpt-image-1 옵션 설정
        // quality: 'standard' 또는 'high' (medium은 지원 안 함)
        let quality = options.quality || IMAGE_QUALITY;
        if (quality === 'medium') {
            quality = 'standard'; // medium을 standard로 변환
        }
        
        const size = options.size || '1024x1024';
        
        console.log(LOG_SUCC_HEADER + LOG_HEADER + ` Starting gpt-image-1 generation (quality: ${quality}, size: ${size})`);
        
        // 재시도 로직
        let retries = MAX_RETRIES;
        let lastError;
        
        while (retries > 0) {
            try {
                // ✅ gpt-image-1 API 호출
                const response = await openai.images.generate({
                    model: "gpt-image-1",
                    prompt: prompt,
                    n: 1,
                    size: size,
                    quality: quality,
                    response_format: "b64_json", // base64로 직접 받기
                    output_format: "png", // gpt-image-1 전용 파라미터
                    background: "auto", // gpt-image-1 전용 파라미터
                    moderation: "auto" // gpt-image-1 전용 파라미터
                });
                
                lastImageGenerationTime = Date.now();
                const generationTime = Date.now() - startTime;
                
                const imageData = response.data[0];
                let imageBase64 = null;
                
                // b64_json 응답 처리
                if (imageData.b64_json) {
                    imageBase64 = imageData.b64_json;
                    console.log(LOG_SUCC_HEADER + LOG_HEADER + ` Image received as base64 (${generationTime}ms)`);
                    
                } else if (imageData.url) {
                    // URL 응답인 경우 (fallback)
                    try {
                        const axios = require('axios');
                        const imageResponse = await axios.get(imageData.url, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        imageBase64 = Buffer.from(imageResponse.data, 'binary').toString('base64');
                        console.log(LOG_SUCC_HEADER + LOG_HEADER + ` Image downloaded from URL (${generationTime}ms)`);
                    } catch (fetchError) {
                        console.error(LOG_ERR_HEADER + LOG_HEADER + " URL fetch error: " + fetchError.message);
                        throw new Error('Failed to fetch image from URL');
                    }
                } else {
                    throw new Error('No image data received from OpenAI');
                }
                
                console.log(LOG_SUCC_HEADER + LOG_HEADER + " gpt-image-1 generation completed successfully");
                
                return {
                    success: true,
                    image_base64: imageBase64,
                    revised_prompt: imageData.revised_prompt || prompt,
                    format: 'png',
                    generation_time: generationTime
                };
                
            } catch (e) {
                lastError = e;
                retries--;
                
                // Rate limit 오류 처리 (429)
                if (e.response && e.response.status === 429) {
                    const waitTime = 60000; // 1분 대기
                    console.error(LOG_ERR_HEADER + LOG_HEADER + ` Rate limited (429), waiting ${waitTime/1000}s... (${retries} retries left)`);
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                    
                // 서비스 unavailable 처리 (503)
                } else if (e.response && e.response.status === 503) {
                    const waitTime = 10000; // 10초 대기
                    console.error(LOG_ERR_HEADER + LOG_HEADER + ` Service unavailable (503), waiting ${waitTime/1000}s... (${retries} retries left)`);
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                    
                // Content policy violation (400 - 재시도 불필요)
                } else if (e.response && e.response.status === 400) {
                    const errorCode = e.response.data?.error?.code;
                    if (errorCode === 'content_policy_violation') {
                        console.error(LOG_ERR_HEADER + LOG_HEADER + " Content policy violation - no retry");
                        return {
                            success: false,
                            error: 'Content policy violation',
                            error_type: 'content_policy',
                            details: e.response.data?.error?.message
                        };
                    }
                    
                // 기타 오류
                } else {
                    const errorMsg = e.response?.data?.error?.message || e.message;
                    console.error(LOG_ERR_HEADER + LOG_HEADER + ` Error: ${errorMsg} (${retries} retries left)`);
                    if (retries > 0) {
                        await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
                    }
                }
            }
        }
        
        // 모든 재시도 실패
        const finalError = lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error';
        console.error(LOG_ERR_HEADER + LOG_HEADER + " All retries failed: " + finalError);
        
        return {
            success: false,
            error: finalError,
            error_type: lastError?.response?.status === 429 ? 'rate_limit' : 'unknown_error',
            details: lastError?.response?.data?.error?.message
        };
        
    } catch (e) {
        console.error(LOG_ERR_HEADER + LOG_HEADER + " Unexpected error: " + (e.message || e));
        
        return {
            success: false,
            error: e.message || 'Image generation failed',
            error_type: 'unexpected_error'
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
        
        // 최소 길이 체크
        if (sceneDescription.length < 20) {
            console.log(`[${LOG_HEADER}] Scene description too short: ${sceneDescription.length} chars`);
            return {
                shouldGenerate: false,
                sceneDescription: '',
                response: assistantResponse
            };
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
        
        // 장면 설명 추가
        if (sceneData.sceneDescription) {
            const cleanedScene = sceneData.sceneDescription
                .replace(/\n/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 150);
            
            basePrompt += cleanedScene + " 앞에서 뒤돌아선 모험가의 뒷모습, ";
        } else {
            basePrompt += "던전 복도를 탐험하는 모험가의 뒷모습, ";
        }
        
        // 공통 스타일
        basePrompt += "흑백 드로잉, 종이 가장자리 말린 고서 스타일, 중세 모험가 일기장 일러스트, 인물은 뒤를 보고 있음, 얼굴이 보이지 않는 뒷모습";
        
        console.log(`[${LOG_HEADER}] Created prompt: ${basePrompt.substring(0, 100)}...`);
        
        return basePrompt;
        
    } catch (e) {
        console.error(`[${LOG_HEADER}] Error: ${e.message || e}`);
        return "양피지에 그려진 연필 스케치, 던전을 탐험하는 모험가의 뒷모습, 흑백 드로잉, 종이 가장자리 말린 고서 스타일, 중세 모험가 일기장 일러스트";
    }
}

module.exports = { 
    sendMessageToGPT,
    waitForCompletion,
    generateImageFromText, 
    extractImageKeywords, 
    createImagePrompt 
};
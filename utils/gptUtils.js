// utils/gptUtils.js
// OpenAI API 통신 유틸리티 함수 모음

const openai = require('../config/openai');
const reqinfo = require('./reqinfo');

//============================================================================================
async function sendMessageToGPT(threadId, assistantId, message) {
//============================================================================================
    const LOG_HEADER_TITLE = "GPT_SEND_MESSAGE";
    const LOG_HEADER = "ThreadId[" + threadId + "] AssistantId[" + assistantId + "] --> " + LOG_HEADER_TITLE;
    const LOG_ERR_HEADER = "[FAIL]";
    const LOG_SUCC_HEADER = "[SUCC]";
    
    let ret_status = 200;
    let ret_data;
    
    try {
        // 메시지 추가
        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: message
        });

        // 실행
        const run = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });

        // 응답 대기
        const runStatus = await waitForCompletion(threadId, run.id);
        if (runStatus.status !== 'completed') {
            throw new Error('응답 실패: ' + runStatus.status);
        }

        // 응답 가져오기
        const messages = await openai.beta.threads.messages.list(threadId);
        ret_data = messages.data[0].content[0].text.value;

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
        console.log(LOG_SUCC_HEADER + LOG_HEADER + " Starting image generation");
        
        // gpt-image-1 사용 (response_format 제거)
        const response = await openai.images.generate({
            model: "gpt-image-1",
            prompt: prompt,
            n: 1,
            size: "256x256",
            quality: "medium"  // gpt-image-1 지원: low, medium, high, auto
            // response_format 파라미터 제거 (gpt-image-1에서 지원하지 않음)
        });
        
        const imageData = response.data[0];
        
        let imageBase64 = null;
        
        // URL 응답인 경우 base64로 변환
        if (imageData.url) {
            try {
                const axios = require('axios');
                const imageResponse = await axios.get(imageData.url, {
                    responseType: 'arraybuffer'
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
        console.error(LOG_ERR_HEADER + LOG_HEADER + " Error: " + (e.message || e));
        
        return {
            success: false,
            error: e.message || 'Image generation failed',
            error_type: e.type || 'unknown_error'
        };
    }
}

//============================================================================================
function extractImageKeywords(assistantResponse) {
//============================================================================================
    const LOG_HEADER_TITLE = "EXTRACT_SCENE_DESCRIPTION";
    const LOG_HEADER = LOG_HEADER_TITLE;
    
    try {
        // 통계 섹션 이전의 상황 묘사만 추출
        let sceneDescription = assistantResponse;
        
        // "통계" 또는 "====" 이전까지만 추출
        const statsMatch = sceneDescription.match(/(.*?)(?=통계|={3,})/s);
        if (statsMatch) {
            sceneDescription = statsMatch[1].trim();
        }
        
        console.log(`[${LOG_HEADER}] Extracted scene description: ${sceneDescription.substring(0, 100)}...`);
        
        return {
            shouldGenerate: true, // 항상 이미지 생성
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
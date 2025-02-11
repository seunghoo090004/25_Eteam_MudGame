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

module.exports = { sendMessageToGPT };
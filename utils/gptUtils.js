// utils/gptUtils.js
// OpenAI API 통신 유틸리티 함수 모음 (레퍼런스 패턴 적용)

const openai = require('../config/openai');
const my_reqinfo = require('./reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

//============================================================================================
async function sendMessageToGPT(threadId, assistantId, message) {
//============================================================================================
    const LOG_HEADER_TITLE = "SEND_MESSAGE_TO_GPT";
    const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] AssistantId[" + my_reqinfo.maskId(assistantId) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_openai_message = -1;
    const catch_openai_run = -2;
    const catch_openai_wait = -3;
    const catch_openai_response = -4;
    
    const EXT_data = { 
        threadId, 
        assistantId, 
        messageLength: message?.length || 0 
    };
    
    try {
        // 메시지 추가
        try {
            await openai.beta.threads.messages.create(threadId, {
                role: "user",
                content: message
            });
        } catch (e) {
            ret_status = fail_status + (-1 * catch_openai_message);
            ret_data = {
                code: LOG_HEADER_TITLE + "(openai_message_create)",
                value: catch_openai_message,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }

        // 실행
        let run;
        try {
            run = await openai.beta.threads.runs.create(threadId, {
                assistant_id: assistantId
            });
        } catch (e) {
            ret_status = fail_status + (-1 * catch_openai_run);
            ret_data = {
                code: LOG_HEADER_TITLE + "(openai_run_create)",
                value: catch_openai_run,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }

        // 응답 대기
        let runStatus;
        try {
            runStatus = await waitForCompletion(threadId, run.id);
            if (runStatus.status !== 'completed') {
                throw new Error('응답 실패: ' + runStatus.status);
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_openai_wait);
            ret_data = {
                code: LOG_HEADER_TITLE + "(openai_wait_completion)",
                value: catch_openai_wait,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }

        // 응답 가져오기
        let response;
        try {
            const messages = await openai.beta.threads.messages.list(threadId);
            response = messages.data[0].content[0].text.value;
        } catch (e) {
            ret_status = fail_status + (-1 * catch_openai_response);
            ret_data = {
                code: LOG_HEADER_TITLE + "(openai_message_retrieve)",
                value: catch_openai_response,
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
                response: response,
                responseLength: response.length,
                runId: run.id,
                runStatus: runStatus.status
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: { 
                responseLength: response.length,
                runId: run.id,
                runStatus: runStatus.status
            }
        }, null, 2));
        
        return response;

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
async function waitForCompletion(threadId, runId) {
//============================================================================================
    const LOG_HEADER_TITLE = "WAIT_FOR_COMPLETION";
    const LOG_HEADER = "ThreadId[" + my_reqinfo.maskId(threadId) + "] RunId[" + my_reqinfo.maskId(runId) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;
    
    const catch_openai_retrieve = -1;
    const catch_timeout = -2;
    
    const EXT_data = { threadId, runId };
    
    let runStatus;
    const startTime = Date.now();
    const timeout = 120000; // 2분 타임아웃
    
    try {
        try {
            runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
        } catch (e) {
            ret_status = fail_status + (-1 * catch_openai_retrieve);
            ret_data = {
                code: LOG_HEADER_TITLE + "(openai_run_retrieve_initial)",
                value: catch_openai_retrieve,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            throw new Error(ret_data.value_ext2);
        }
        
        while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
            // 타임아웃 체크
            if (Date.now() - startTime > timeout) {
                ret_status = fail_status + (-1 * catch_timeout);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(timeout)",
                    value: catch_timeout,
                    value_ext1: ret_status,
                    value_ext2: `Operation timed out after ${timeout}ms`,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
            
            console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Current status: " + runStatus.status);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                runStatus = await openai.beta.threads.runs.retrieve(threadId, runId);
            } catch (e) {
                ret_status = fail_status + (-1 * catch_openai_retrieve);
                ret_data = {
                    code: LOG_HEADER_TITLE + "(openai_run_retrieve_loop)",
                    value: catch_openai_retrieve,
                    value_ext1: ret_status,
                    value_ext2: e.message,
                    EXT_data
                };
                console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
                throw new Error(ret_data.value_ext2);
            }
        }

        ret_data = {
            code: "result",
            value: 1,
            value_ext1: ret_status,
            value_ext2: {
                status: runStatus.status,
                completedAt: new Date().toISOString(),
                totalWaitTime: Date.now() - startTime
            },
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        return runStatus;

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

module.exports = { sendMessageToGPT };
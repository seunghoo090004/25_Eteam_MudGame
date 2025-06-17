// routes/assistant/list.js - 레퍼런스 패턴 적용

'use strict';
const express = require('express');
const router = express.Router();
const openai = require('../../config/openai');
const my_reqinfo = require('../../utils/reqinfo');

const LOG_FAIL_HEADER = "[FAIL]";
const LOG_SUCC_HEADER = "[SUCC]";
const LOG_INFO_HEADER = "[INFO]";

//========================================================================
router.get('/', async(req, res) => 
//========================================================================
{
    const LOG_HEADER_TITLE = "FETCH_ASSISTANTS";
    const EXT_data = my_reqinfo.get_req_url(req);
    const LOG_HEADER = "SessionUserId[" + my_reqinfo.maskId(req.session?.userId) + "] --> " + LOG_HEADER_TITLE;
    
    const fail_status = 500;
    let ret_status = 200;
    let ret_data;

    const catch_auth = -1;
    const catch_openai = -2;
    const catch_data_processing = -3;
    
    try {
        //----------------------------------------------------------------------
        // 인증 확인 (선택적 - 필요시 주석 해제)
        //----------------------------------------------------------------------
        // try {
        //     if (!req.session?.userId) {
        //         throw new Error("Authentication required");
        //     }
        // } catch (e) {
        //     ret_status = fail_status + (-1 * catch_auth);
        //     ret_data = {
        //         code: LOG_HEADER_TITLE + "(authentication)",
        //         value: catch_auth,
        //         value_ext1: ret_status,
        //         value_ext2: e.message,
        //         EXT_data
        //     };
        //     console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
        //     
        //     return res.status(401).json({
        //         msg: "ERROR: Authentication required",
        //         data: null,
        //     });
        // }
        
        //----------------------------------------------------------------------
        // OpenAI API - 어시스턴트 목록 조회
        //----------------------------------------------------------------------
        let assistants;
        try {
            assistants = await openai.beta.assistants.list();
            
            if (!assistants || !assistants.data) {
                throw new Error("Invalid response from OpenAI API");
            }
        } catch (e) {
            ret_status = fail_status + (-1 * catch_openai);
            ret_data = {
                code: LOG_HEADER_TITLE + "(openai_api)",
                value: catch_openai,
                value_ext1: ret_status,
                value_ext2: e.message,
                EXT_data
            };
            console.error(LOG_FAIL_HEADER + " " + LOG_HEADER + ":", JSON.stringify(ret_data, null, 2));
            
            return res.status(ret_status).json({
                msg: "ERROR: error while " + LOG_HEADER_TITLE + "(openai_api)",
                data: e.message,
            });
        }
        
        //----------------------------------------------------------------------
        // 데이터 처리 - 필요한 정보만 추출
        //----------------------------------------------------------------------
        let processedData;
        try {
            processedData = assistants.data.map(assistant => {
                // 필수 필드 검증
                if (!assistant.id || !assistant.name) {
                    console.log(LOG_INFO_HEADER + " " + LOG_HEADER + " Assistant missing required fields:", {
                        id: assistant.id,
                        name: assistant.name
                    });
                }
                
                return {
                    id: assistant.id || 'unknown',
                    name: assistant.name || 'Unnamed Assistant',
                    description: assistant.description || null,
                    model: assistant.model || null,
                    created_at: assistant.created_at ? new Date(assistant.created_at * 1000).toISOString() : null
                };
            });
            
            // 유효한 어시스턴트만 필터링
            processedData = processedData.filter(assistant => 
                assistant.id !== 'unknown' && assistant.name !== 'Unnamed Assistant'
            );
            
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
            
            return res.status(ret_status).json({
                msg: "ERROR: error while " + LOG_HEADER_TITLE + "(data_processing)",
                data: e.message,
            });
        }
        
        //----------------------------------------------------------------------
        // result - 성공 응답
        //----------------------------------------------------------------------
        ret_data = {
            code: "result",
            value: processedData.length,
            value_ext1: ret_status,
            value_ext2: processedData,
            EXT_data
        };
        
        console.log(LOG_SUCC_HEADER + " " + LOG_HEADER + ":", JSON.stringify({
            ...ret_data,
            value_ext2: `${processedData.length} assistants retrieved`
        }, null, 2));
        
        return res.status(ret_status).json({
            msg: "SUCC: assistants list retrieved",
            data: ret_data.value_ext2,
        });
        
    } catch (e) {
        // 예상치 못한 오류 처리
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
        
        return res.status(ret_status).json({
            msg: "ERROR: error while " + LOG_HEADER_TITLE + "(unexpected_error)",
            data: e.message,
        });
    }
});

module.exports = router;
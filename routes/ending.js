// routes/ending.js - 엔딩 페이지 라우터

const express = require('express');
const router = express.Router();
const reqinfo = require('../utils/reqinfo');

// GET /ending - 엔딩 페이지 렌더링
router.get('/', function(req, res) {
    const LOG_HEADER = "ROUTE/ENDING";
    
    try {
        // 쿼리 파라미터에서 엔딩 정보 추출
        const {
            type = 'unknown',
            turns = 0,
            deaths = 0,
            cause = '알 수 없음',
            method = '일반적인 방법',
            achievement = null
        } = req.query;
        
        console.log(`[${LOG_HEADER}] Rendering ending: ${type}, turns: ${turns}, deaths: ${deaths}`);
        
        // 엔딩 데이터 구성
        const endingData = {
            type: type,
            turnCount: parseInt(turns) || 0,
            deathCount: parseInt(deaths) || 0,
            cause: cause,
            method: method,
            achievement: achievement,
            playerName: req.session.username || '플레이어'
        };
        
        // 엔딩 스토리 생성
        const endingStory = generateEndingStory(endingData);
        
        res.render('ending', {
            ...endingData,
            story: endingStory,
            title: getEndingTitle(type)
        });
        
    } catch (error) {
        console.error(`[${LOG_HEADER}] Error: ${error.message}`);
        res.status(500).render('error', {
            message: '엔딩 페이지 로드 중 오류가 발생했습니다.',
            error: error
        });
    }
});

// 엔딩 스토리 생성 함수
function generateEndingStory(data) {
    const { type, turnCount, deathCount, cause, method, achievement, playerName } = data;
    
    switch (type) {
        case 'death':
            return generateDeathStory(playerName, turnCount, deathCount, cause);
        case 'escape':
            return generateEscapeStory(playerName, turnCount, deathCount, method);
        case 'special':
            return generateSpecialStory(playerName, turnCount, deathCount, achievement);
        default:
            return generateDefaultStory(playerName, turnCount, deathCount);
    }
}

// 사망 엔딩 스토리
function generateDeathStory(playerName, turns, deaths, cause) {
    const stories = {
        '함정': `${playerName}는 ${turns}턴 동안 던전의 위험을 헤쳐나갔지만, 결국 교묘한 함정의 희생양이 되었습니다. 총 ${deaths}번의 죽음 끝에, 던전은 또 다른 영혼을 집어삼켰습니다.`,
        '추락': `${turns}턴의 필사적인 탐험 끝에, ${playerName}는 어둠 속 낭떠러지로 추락했습니다. ${deaths}번의 죽음을 겪으며 던전의 잔혹함을 몸소 체험했지만, 결국 중력을 이길 수는 없었습니다.`,
        '독': `독의 고통 속에서 ${playerName}의 여정이 끝났습니다. ${turns}턴 동안 버텨왔지만, 던전의 치명적인 독가스가 마침내 그를 쓰러뜨렸습니다. 이것이 ${deaths}번째 죽음이었습니다.`,
        default: `${playerName}는 ${turns}턴 동안 용감히 싸웠지만, 던전의 어둠이 그를 집어삼켰습니다. 총 ${deaths}번의 죽음을 겪으며 한계에 도전했지만, 이번에는 더 이상 일어날 수 없었습니다.`
    };
    
    return stories[cause] || stories.default;
}

// 탈출 엔딩 스토리
function generateEscapeStory(playerName, turns, deaths, method) {
    const baseStory = `놀랍게도 ${playerName}는 해냈습니다! ${turns}턴의 극한 상황을 견뎌내고, ${deaths}번의 죽음을 극복한 끝에 던전에서 탈출했습니다.`;
    
    const methodStories = {
        '지혜로운 탈출': `${baseStory} 지혜와 관찰력으로 던전의 비밀을 풀어내며, 수많은 퍼즐을 해결한 결과였습니다.`,
        '용감한 탈출': `${baseStory} 두려움을 떨쳐내고 정면승부를 택한 용기가 결국 자유를 가져다주었습니다.`,
        '비밀 통로': `${baseStory} 숨겨진 통로를 발견한 것이 운명을 바꾸었습니다. 때로는 정답이 가장 예상치 못한 곳에 있습니다.`,
        default: `${baseStory} 포기하지 않은 의지력이 불가능을 가능으로 만들었습니다.`
    };
    
    return methodStories[method] || methodStories.default;
}

// 특별 엔딩 스토리
function generateSpecialStory(playerName, turns, deaths, achievement) {
    return `전설이 되었습니다! ${playerName}는 ${turns}턴에 걸친 장대한 여정과 ${deaths}번의 죽음을 통해 "${achievement}"을 달성했습니다. 이는 던전 역사상 전무후무한 업적으로 기록될 것입니다.`;
}

// 기본 엔딩 스토리
function generateDefaultStory(playerName, turns, deaths) {
    return `${playerName}의 던전 탐험이 마무리되었습니다. ${turns}턴의 여정과 ${deaths}번의 시행착오를 통해 많은 것을 배웠습니다. 비록 완전한 성공은 아니었지만, 이 경험은 평생 잊지 못할 모험이 될 것입니다.`;
}

// 엔딩 제목 생성 함수
function getEndingTitle(type) {
    const titles = {
        'death': '게임 오버',
        'escape': '던전 탈출 성공!',
        'special': '전설적 업적 달성!',
        'unknown': '모험의 끝'
    };
    
    return titles[type] || titles.unknown;
}

module.exports = router;
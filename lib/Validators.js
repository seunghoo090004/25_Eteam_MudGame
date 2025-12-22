/**
 * 재사용 가능한 검증 규칙 모음
 */
const Validators = {
    /**
     * 이메일 검증
     */
    email: (value) => {
        if (!value) return '이메일을 입력해주세요.';
        if (value.trim() === '') return '이메일을 입력해주세요.';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return '올바른 이메일 형식이 아닙니다.';
        return null;
    },

    /**
     * 비밀번호 검증
     */
    password: (value, minLength = 8) => {
        if (!value) return '비밀번호를 입력해주세요.';
        if (value.length < minLength) {
            return `비밀번호는 최소 ${minLength}자 이상이어야 합니다.`;
        }
        return null;
    },

    /**
     * 사용자명 검증
     */
    username: (value, minLength = 3) => {
        if (!value) return '사용자명을 입력해주세요.';
        if (value.length < minLength) {
            return `사용자명은 최소 ${minLength}자 이상이어야 합니다.`;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
            return '사용자명은 영문, 숫자, 언더스코어만 사용 가능합니다.';
        }
        return null;
    },

    /**
     * 문자열 길이 검증
     */
    minLength: (value, min) => {
        if (!value) return `필수 입력값입니다.`;
        if (value.length < min) return `최소 ${min}자 이상이어야 합니다.`;
        return null;
    },

    maxLength: (value, max) => {
        if (!value) return null;
        if (value.length > max) return `최대 ${max}자 이하여야 합니다.`;
        return null;
    },

    /**
     * 필수 필드 검증
     */
    required: (value) => {
        if (!value || (typeof value === 'string' && value.trim() === '')) {
            return '필수 입력값입니다.';
        }
        return null;
    }
};

/**
 * 검증 함수
 * @param {object} data - 검증할 데이터
 * @param {object} rules - 검증 규칙 { fieldName: validator }
 * @returns {object} { isValid: boolean, errors: {...} }
 */
function validate(data = {}, rules = {}) {
    const errors = {};
    
    for (const [field, validator] of Object.entries(rules)) {
        const value = data[field];
        const error = typeof validator === 'function' 
            ? validator(value)
            : null;
        
        if (error) {
            errors[field] = error;
        }
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

module.exports = {
    Validators,
    validate
};

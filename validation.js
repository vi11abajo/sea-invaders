//VALIDATION - input validation helpers for the legacy client

/**
 * Validates a score value before it is submitted
 * @param {number} score - player score
 * @param {number} minScore - lowest accepted score (default 0)
 * @returns {Object} {valid: boolean, error: string}
 */
window.validateScoreValue = function(score, minScore = 0) {
    if (typeof score !== 'number' || isNaN(score)) {
        return { valid: false, error: 'Invalid score value' };
    }

    if (score < minScore) {
        return { valid: false, error: `Score must be at least ${minScore}` };
    }

    if (score > 999999999) {
        return { valid: false, error: 'Score value is too large' };
    }

    if (!Number.isInteger(score)) {
        return { valid: false, error: 'Score must be an integer' };
    }

    return { valid: true, error: null };
};

/**
 * Sanitizes user input to prevent XSS
 * @param {string} input - raw user input
 * @returns {string} sanitized string
 */
window.sanitizeInput = function(input) {
    if (!input || typeof input !== 'string') return '';

    //Strip HTML tags
    let clean = input.replace(/<[^>]*>/g, '');

    //Escape the remaining special characters
    clean = clean.replace(/[<>'"]/g, (char) => {
        const map = {
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        };
        return map[char];
    });

    return clean.trim();
};

/**
 * Renders validation errors into a container element
 * @param {string[]} errors - list of error messages
 * @param {string} containerId - ID of the container element
 */
window.displayValidationErrors = function(errors, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error('Error container not found:', containerId);
        return;
    }

    if (!errors || errors.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    const errorHtml = errors.map(error =>
        `<div class="validation-error"> ${window.escapeHtml(error)}</div>`
    ).join('');

    container.innerHTML = errorHtml;
    container.style.display = 'block';
};

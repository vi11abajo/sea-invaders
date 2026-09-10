//or - function for inwith to

/**
 * Shortens a long identifier (e.g. an account address) for display
 * @param {string} address - full value
 * @param {number} startChars - characters to keep at the start (default 6)
 * @param {number} endChars - characters to keep at the end (default 4)
 * @returns {string} shortened value, e.g. "AbCd12...wXyZ"
 */
window.formatAddress = function(address, startChars = 6, endChars = 4) {
    if (!address || typeof address !== 'string') return '';
    if (address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

/**
 * Masks the middle of a long identifier (e.g. for public displays)
 * @param {string} address - full value
 * @returns {string} masked value, e.g. "AbCd12***UvwXyZ"
 */
window.maskAddress = function(address) {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}***${address.slice(-6)}`;
};

/**
 * inand yesand toonand - while
 * @param {string|HTMLElement} modalElement - ID element or with element
 */
window.showModal = function(modalElement) {
    const modal = typeof modalElement === 'string'
        ? document.getElementById(modalElement)
        : modalElement;

    if (!modal) {
        console.error('Modal element not found:', modalElement);
        return;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; //toand withto
};

/**
 * inand yesand toonand - withto
 * @param {string|HTMLElement} modalElement - ID element or with element
 */
window.hideModal = function(modalElement) {
    const modal = typeof modalElement === 'string'
        ? document.getElementById(modalElement)
        : modalElement;

    if (!modal) {
        console.error('Modal element not found:', modalElement);
        return;
    }

    modal.style.display = 'none';
    document.body.style.overflow = ''; //inwithwithoninandin withto
};

/**
 * toand yesbut toon at toandto inNOT 
 * @param {MouseEvent} event - event toandto
 * @param {HTMLElement} modal - yesbut tobut
 * @param {HTMLElement} modalContent - withand yesbut toon
 */
window.handleModalOutsideClick = function(event, modal, modalContent) {
    if (event.target === modal && !modalContent.contains(event.target)) {
        hideModal(modal);
    }
};

/**
 * inandyesand andand player
 * @param {string} name - and for intoand
 * @param {number} minLength - andandon andon (by default 2)
 * @param {number} maxLength - towithandon andon (by default 32)
 * @returns {Object} {valid: boolean, error: string}
 */
window.validatePlayerName = function(name, minLength = 2, maxLength = 32) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Name is required' };
    }

    const trimmed = name.trim();

    if (trimmed.length < minLength) {
        return { valid: false, error: `Name must be at least ${minLength} characters` };
    }

    if (trimmed.length > maxLength) {
        return { valid: false, error: `Name must be less than ${maxLength} characters` };
    }

    //Check on NOTtowithand withandin
    if (!/^[a-zA-Z0-9_\s.-]+$/.test(trimmed)) {
        return { valid: false, error: 'Name contains invalid characters' };
    }

    return { valid: true, error: null };
};

/**
 * toandinand HTML for and from XSS
 * @param {string} text - towith for toandinand
 * @returns {string} toandin towith
 */
window.escapeHtml = function(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * function toand inyes menu
 */
window.toggleMenu = function() {
    const menu = document.getElementById('dropdownMenu');
    const menuButton = document.getElementById('menuButton');

    if (!menu || !menuButton) {
        console.error('Menu elements not found');
        return;
    }

    if (menu.style.display === 'none' || menu.style.display === '') {
        //in andand menu frombutwithandbut tobuttoand
        const rect = menuButton.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 2) + 'px';
        menu.style.right = 'auto';
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
};

/**
 * toand inyes menu at toandto inNOT 
 */
window.initMenuClickOutside = function() {
    document.addEventListener('click', function(event) {
        const menu = document.getElementById('dropdownMenu');
        const menuButton = document.getElementById('menuButton');

        if (menu && menuButton && !menu.contains(event.target) && !menuButton.contains(event.target)) {
            menu.style.display = 'none';
        }
    });
};

/**
 * while andandto toand
 * @param {string} message - withand for fromand
 * @returns {HTMLElement} element andandto toand
 */
window.showLoadingIndicator = function(message = 'Loading...') {
    //Deleting withwithinand andandto, if with
    hideLoadingIndicator();

    const indicator = document.createElement('div');
    indicator.id = 'global-loading-indicator';
    indicator.className = 'loading-indicator';
    indicator.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <div>${message}</div>
        </div>
    `;

    document.body.appendChild(indicator);
    return indicator;
};

/**
 * withto andandto toand
 */
window.hideLoadingIndicator = function() {
    const indicator = document.getElementById('global-loading-indicator');
    if (indicator) {
        indicator.remove();
    }
};

/**
 * while intoand
 * @param {string} message - towith intoand
 * @param {string} type - and intoand: 'success', 'error', 'info'
 * @param {number} duration - andbutwith while in with (0 = withtoNOTbut)
 */
window.showNotification = function(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    //inandwithto yesand
    if (duration > 0) {
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    return notification;
};

/**
 * while toandandwithto intoand ( inand OK)
 * @param {string} title - into intoand
 * @param {string} message - withand
 * @returns {Promise} Promise tofrom resolve'andwith toyes in on OK
 */
window.showCriticalNotification = function(title, message) {
    return new Promise((resolve) => {
        //Creating overlay (NOT background)
        const overlay = document.createElement('div');
        overlay.className = 'notification-overlay';

        //Creating yesbut tobut
        const modal = document.createElement('div');
        modal.className = 'notification-critical';

        //into
        const titleEl = document.createElement('div');
        titleEl.className = 'notification-critical-title';
        titleEl.textContent = title;

        //withand
        const messageEl = document.createElement('div');
        messageEl.className = 'notification-critical-message';
        messageEl.innerHTML = message;

        //tobutto OK
        const btn = document.createElement('button');
        btn.className = 'notification-critical-btn';
        btn.textContent = 'OK';

        //handler toandto on tobutto
        const closeNotification = () => {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            modal.style.animation = 'scaleOut 0.3s ease-out';

            setTimeout(() => {
                overlay.remove();
                modal.remove();
                resolve();
            }, 300);
        };

        btn.addEventListener('click', closeNotification);

        //withand yesbut tobut
        modal.appendChild(titleEl);
        modal.appendChild(messageEl);
        modal.appendChild(btn);

        //Adding on withand
        document.body.appendChild(overlay);
        document.body.appendChild(modal);
    });
};

/**
 * formandinand numbers with andand with
 * @param {number} num - number for formandinand
 * @returns {string} fromformandinbut number
 */
window.formatNumber = function(num) {
    if (typeof num !== 'number') return num;
    return num.toLocaleString('en-US');
};

/**
 * toandinand text in  on
 * @param {string} text - towith for toandinand
 * @returns {Promise<boolean>} true if successfully
 */
window.copyToClipboard = async function(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard!', 'success', 2000);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        showNotification('Failed to copy', 'error', 2000);
        return false;
    }
};

/**
 * Debounce function (andand withfrom ininin)
 * @param {Function} func - function for inin
 * @param {number} wait - to in with
 * @returns {Function} Debounced function
 */
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

/**
 * Throttle function (andand withfrom inNOTand)
 * @param {Function} func - function for inin
 * @param {number} limit - andand interval  ininand in with
 * @returns {Function} Throttled function
 */
window.throttle = function(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

//Initialization at to DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuClickOutside);
} else {
    initMenuClickOutside();
}

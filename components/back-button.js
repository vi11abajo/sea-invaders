//Back Button Component - CSS + JS in but file
//useswith for oninandandand on (Back to Single Player, Back to Menu and ..)

(function() {
    'use strict';

    //========== withor ==========
    if (!document.getElementById('back-button-styles')) {
        const style = document.createElement('style');
        style.id = 'back-button-styles';
        style.textContent = `
            .back-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                background: linear-gradient(135deg, rgba(78, 156, 250, 0.9), rgba(64, 136, 230, 0.9));
                color: white;
                border: 2px solid rgba(78, 156, 250, 0.3);
                padding: 10px 16px;
                margin: 0;
                border-radius: 50px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                box-shadow: 0 4px 15px rgba(78, 156, 250, 0.3);
                position: relative;
                overflow: hidden;
                min-height: 40px;
                line-height: 1.2;
            }

            .back-button::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }

            .back-button:hover {
                background: linear-gradient(135deg, rgba(88, 166, 255, 0.95), rgba(74, 146, 240, 0.95));
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(78, 156, 250, 0.5);
            }

            .back-button:hover::before {
                left: 100%;
            }

            .back-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 10px rgba(78, 156, 250, 0.3);
            }

            .back-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            .back-button .arrow {
                font-size: 16px;
                transition: transform 0.3s ease;
            }

            .back-button:hover .arrow {
                transform: translateX(-3px);
            }

 /* andon yesand */
            @media (max-width: 768px) {
                .back-button {
                    padding: 8px 12px;
                    font-size: 13px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    //========== class toNOT ==========
    class BackButton {
        constructor(container, options = {}) {
            this.container = typeof container === 'string'
                ? document.querySelector(container)
                : container;

            if (!this.container) {
                console.error(' Back Button: Container not found');
                return;
            }

            this.options = {
                text: options.text || 'Back',
                arrow: options.arrow !== false, //whilein withto by default
                href: options.href || null, //withwithto (if on <a> inwith <button>)
                onClick: options.onClick || null,
                ...options
            };

            this.element = null;
            this.render();
            this.init();
        }

        render() {
            const arrowHtml = this.options.arrow ? '<span class="arrow">←</span>' : '';
            const content = `${arrowHtml}<span>${this.options.text}</span>`;

            //if toon withwithto, Creating <a>, else <button>
            if (this.options.href) {
                this.container.innerHTML = `<a href="${this.options.href}" class="back-button">${content}</a>`;
            } else {
                this.container.innerHTML = `<button class="back-button">${content}</button>`;
            }

            this.element = this.container.querySelector('.back-button');
        }

        init() {
            if (this.options.onClick) {
                this.element.addEventListener('click', (e) => {
                    //if withwithto and with onClick, toin
                    if (this.options.href && this.options.onClick) {
                        e.preventDefault();
                    }
                    this.options.onClick(e);
                });
            }
        }

        //========== and method ==========

        setText(text) {
            const span = this.element.querySelector('span:not(.arrow)');
            if (span) {
                span.textContent = text;
            }
        }

        setHref(href) {
            if (this.element.tagName === 'A') {
                this.element.href = href;
            }
        }

        disable() {
            if (this.element.tagName === 'BUTTON') {
                this.element.disabled = true;
            } else {
                this.element.style.pointerEvents = 'none';
                this.element.style.opacity = '0.6';
            }
        }

        enable() {
            if (this.element.tagName === 'BUTTON') {
                this.element.disabled = false;
            } else {
                this.element.style.pointerEvents = '';
                this.element.style.opacity = '';
            }
        }

        destroy() {
            if (this.container) {
                this.container.innerHTML = '';
            }
        }
    }

    //========== on function ==========
    window.createBackButton = function(container, options) {
        return new BackButton(container, options);
    };

    //towithand class
    window.BackButton = BackButton;

})();

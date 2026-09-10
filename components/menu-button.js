//Menu Button Component - CSS + JS in but file
//useswith for fromtoand menu oninandandand

(function() {
    'use strict';

    //========== withor ==========
    if (!document.getElementById('menu-button-styles')) {
        const style = document.createElement('style');
        style.id = 'menu-button-styles';
        style.textContent = `
            .menu-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
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

            .menu-button::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }

            .menu-button:hover {
                background: linear-gradient(135deg, rgba(88, 166, 255, 0.95), rgba(74, 146, 240, 0.95));
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(78, 156, 250, 0.5);
            }

            .menu-button:hover::before {
                left: 100%;
            }

            .menu-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 10px rgba(78, 156, 250, 0.3);
            }

            .menu-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            .menu-button.active {
                background: linear-gradient(135deg, rgba(100, 176, 255, 0.95), rgba(84, 156, 250, 0.95));
                box-shadow: 0 6px 20px rgba(78, 156, 250, 0.6);
            }

            .menu-button img,
            .menu-button svg {
                width: 20px;
                height: 20px;
                vertical-align: middle;
                flex-shrink: 0;
            }

            .menu-button .menu-icon {
                transition: transform 0.3s ease;
            }

            .menu-button.active .menu-icon {
                transform: rotate(90deg);
            }

 /* andon yesand */
            @media (max-width: 768px) {
                .menu-button {
                    padding: 8px 12px;
                    font-size: 13px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    //========== class toNOT ==========
    class MenuButton {
        constructor(container, options = {}) {
            this.container = typeof container === 'string'
                ? document.querySelector(container)
                : container;

            if (!this.container) {
                console.error(' Menu Button: Container not found');
                return;
            }

            this.options = {
                text: options.text || 'MENU',
                icon: options.icon || '/themes/default/images/menu.png', //path to andtoto or null
                onClick: options.onClick || null,
                toggleClass: options.toggleClass || 'active', //class for toandinbut states
                ...options
            };

            this.button = null;
            this.isActive = false;

            this.render();
            this.init();
        }

        render() {
            let iconHtml = '';
            if (this.options.icon) {
                //Checking, SVG or fromand
                if (this.options.icon.includes('<svg')) {
                    iconHtml = `<span class="menu-icon">${this.options.icon}</span>`;
                } else {
                    iconHtml = `<img src="${this.options.icon}" alt="Menu" class="menu-icon">`;
                }
            }

            const buttonId = this.options.id || '';
            this.container.innerHTML = `<button class="menu-button" ${buttonId ? `id="${buttonId}"` : ''}>${iconHtml}<span>${this.options.text}</span></button>`;

            this.button = this.container.querySelector('.menu-button');
        }

        init() {
            this.button.addEventListener('click', () => this.handleClick());
        }

        handleClick() {
            this.toggle();

            if (this.options.onClick) {
                this.options.onClick(this.isActive);
            }
        }

        //========== and method ==========

        toggle() {
            this.isActive = !this.isActive;
            if (this.isActive) {
                this.button.classList.add(this.options.toggleClass);
            } else {
                this.button.classList.remove(this.options.toggleClass);
            }
            return this.isActive;
        }

        setActive(active) {
            this.isActive = active;
            if (active) {
                this.button.classList.add(this.options.toggleClass);
            } else {
                this.button.classList.remove(this.options.toggleClass);
            }
        }

        setText(text) {
            const span = this.button.querySelector('span:not(.menu-icon)');
            if (span) {
                span.textContent = text;
            }
        }

        disable() {
            this.button.disabled = true;
        }

        enable() {
            this.button.disabled = false;
        }

        destroy() {
            if (this.container) {
                this.container.innerHTML = '';
            }
        }
    }

    //========== on function ==========
    window.createMenuButton = function(container, options) {
        return new MenuButton(container, options);
    };

    //towithand class
    window.MenuButton = MenuButton;

})();

//Discord Button Component - CSS + JS in but file
//useswith for infromandand Discord

(function() {
    'use strict';

    //========== withor ==========
    //Adding withor in <head> at in to
    if (!document.getElementById('discord-button-styles')) {
        const style = document.createElement('style');
        style.id = 'discord-button-styles';
        style.textContent = `
            .discord-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                background: linear-gradient(135deg, #5865F2, #4752C4);
                color: white;
                border: 2px solid rgba(88, 101, 242, 0.3);
                padding: 10px 16px;
                margin: 0;
                border-radius: 50px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                box-shadow: 0 4px 15px rgba(88, 101, 242, 0.3);
                position: relative;
                overflow: hidden;
                min-height: 40px;
                line-height: 1.2;
            }

            .discord-button::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }

            .discord-button:hover {
                background: linear-gradient(135deg, #6b75ff, #5562d8);
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(88, 101, 242, 0.5);
            }

            .discord-button:hover::before {
                left: 100%;
            }

            .discord-button:active {
                transform: translateY(0);
                box-shadow: 0 2px 10px rgba(88, 101, 242, 0.3);
            }

            .discord-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            .discord-button.connected {
                background: linear-gradient(135deg, #00C851, #00A33C);
                border-color: rgba(0, 200, 81, 0.3);
                box-shadow: 0 4px 15px rgba(0, 200, 81, 0.3);
            }

            .discord-button.connected:hover {
                background: linear-gradient(135deg, #00E15A, #00C851);
                box-shadow: 0 6px 20px rgba(0, 200, 81, 0.5);
            }

            .discord-button svg,
            .discord-button img {
                width: 20px;
                height: 20px;
                vertical-align: middle;
                flex-shrink: 0;
            }

            .discord-button .discord-icon {
                filter: brightness(0) saturate(100%) invert(100%);
            }

            .discord-button .username {
                max-width: 150px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

 /* andon yesand */
            @media (max-width: 768px) {
                .discord-button {
                    padding: 8px 12px;
                    font-size: 13px;
                }

                .discord-button .username {
                    max-width: 100px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    //========== class toNOT ==========
    class DiscordButton {
        constructor(container, options = {}) {
            this.container = typeof container === 'string'
                ? document.querySelector(container)
                : container;

            if (!this.container) {
                console.error(' Discord Button: Container not found');
                return;
            }

            this.options = {
                text: options.text || 'Login with Discord',
                connectedText: options.connectedText || null, //if null, while username
                showIcon: options.showIcon !== false,
                onLogin: options.onLogin || null,
                onLogout: options.onLogout || null,
                autoConnect: options.autoConnect !== false, //inandwithtoand in authManager
                ...options
            };

            this.button = null;
            this.isConnected = false;
            this.username = null;
            this.userAvatar = null;

            this.render();
            this.init();

            //inandwithto withandfromand with authManager
            if (this.options.autoConnect) {
                //with
                this.syncWithAuthManager();

                //to 500with and 1500with (on with toand toand authManager)
                setTimeout(() => this.syncWithAuthManager(), 500);
                setTimeout(() => this.syncWithAuthManager(), 1500);
            }
        }

        render() {
            let iconHtml = '';

            if (this.isConnected && this.userAvatar) {
                //whilein into in ( class discord-icon NOT was and)
                iconHtml = `<img src="${this.userAvatar}" alt="Avatar" class="user-avatar" style="width: 24px; height: 24px; border-radius: 50%;">`;
            } else if (this.options.showIcon) {
                //whilein andtoto Discord
                iconHtml = `
                    <img src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/discord.svg"
                         alt="Discord"
                         class="discord-icon">
                `;
            }

            const textContent = this.isConnected
                ? (this.options.connectedText || this.username || 'Connected')
                : this.options.text;

            this.container.innerHTML = `<button class="discord-button ${this.isConnected ? 'connected' : ''}">${iconHtml}<span class="username">${textContent}</span></button>`;

            this.button = this.container.querySelector('.discord-button');
        }

        init() {
            this.button.addEventListener('click', () => this.handleClick());
        }

        handleClick() {
            if (this.isConnected) {
                //if to, can with logout or while menu
                if (this.options.onLogout) {
                    this.options.onLogout();
                }
            } else {
                //and
                if (this.options.onLogin) {
                    this.options.onLogin();
                } else if (window.authManager && typeof window.authManager.loginWithDiscord === 'function') {
                    window.authManager.loginWithDiscord();
                } else {
                    console.error(' authManager.loginWithDiscord not found');
                }
            }
        }

        //withandfromand with authManager
        syncWithAuthManager() {
            if (!window.authManager) {
                return;
            }

            const user = window.authManager.getCurrentUser();

            if (user) {
                const username = user.username || user.discord_username || 'User';

                let avatarUrl = null;
                if (user.avatar && user.discord_id) {
                    avatarUrl = `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=32`;
                } else if (user.discord_id) {
                    //in Discord
                    avatarUrl = `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discord_id) % 5}.png`;
                }

                this.setConnected(username, avatarUrl);
            } else {
                this.setDisconnected();
            }
        }

        //========== and method ==========

        setConnected(username, avatar = null) {
            this.isConnected = true;
            this.username = username;
            this.userAvatar = avatar;

            //inin tobutto with butinand yesand
            this.render();
            this.init(); //to handlerand
        }

        setDisconnected() {
            this.isConnected = false;
            this.username = null;
            this.userAvatar = null;

            //inin tobutto
            this.render();
            this.init(); //to handlerand
        }

        setText(text) {
            this.button.querySelector('.username').textContent = text;
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
    window.createDiscordButton = function(container, options) {
        return new DiscordButton(container, options);
    };

    //towithand class for inand inand
    window.DiscordButton = DiscordButton;

})();

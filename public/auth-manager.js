//Discord Authentication Manager
//Discord authentication management

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.isLoading = false;
        this.listeners = [];
    }

    /**
     * Check authorization on page load
     */
    async init() {
        console.log('🔐 AuthManager: Initializing...');

        //Check URL for token presence (callback from Discord)
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const error = urlParams.get('error');

        if (error) {
            console.error(' Auth error:', error);
            this.showAuthError(error);
            //Clear URL from error parameters, but keep the rest
            const url = new URL(window.location.href);
            url.searchParams.delete('error');
            url.searchParams.delete('token');

            let cleanUrl = url.pathname;
            if (url.search && url.search !== '?') {
                cleanUrl += url.search;
            }
            if (url.hash) {
                cleanUrl += url.hash;
            }

            window.history.replaceState({}, document.title, cleanUrl);
            return false;
        }

        if (token) {
            console.log('🔐 AuthManager: Token found in URL, saving...');
            apiClient.setToken(token);

            //Clear URL from token, but keep other query parameters and hash
            const url = new URL(window.location.href);
            url.searchParams.delete('token');
            url.searchParams.delete('error');

            //Form clean URL
            let cleanUrl = url.pathname;
            if (url.search && url.search !== '?') {
                cleanUrl += url.search;
            }
            if (url.hash) {
                cleanUrl += url.hash;
            }

            window.history.replaceState({}, document.title, cleanUrl);
            await this.loadCurrentUser();
            return true;
        }

        //Check for saved token
        const savedToken = localStorage.getItem('authToken');
        console.log('🔐 AuthManager: Checking saved token...', savedToken ? 'Found!' : 'Not found');

        if (apiClient.isAuthenticated()) {
            console.log('🔐 AuthManager: Loading user with saved token...');
            await this.loadCurrentUser();
            const result = !!this.currentUser;
            console.log('🔐 AuthManager: User loaded:', result ? 'Success' : 'Failed');
            return result;
        }

        console.log('🔐 AuthManager: No authentication found');
        return false;
    }

    /**
     * Load current user data
     */
    async loadCurrentUser() {
        try {
            this.isLoading = true;
            const response = await apiClient.getCurrentUser();

            if (response && response.user) {
                this.currentUser = response.user;
                //Set window.discordUser for ThemeAdminManager
                window.discordUser = response.user;
                this.updateUI();
                this.notifyListeners('login', this.currentUser);
                return true;
            } else {
                //FIXED: do not drop the token right away, allow a retry
                //Invalid token - keeping for retry
                console.warn('Failed to load user data, but keeping token for retry');
                this.currentUser = null;
                window.discordUser = null;
                this.updateUI();
                return false;
            }
        } catch (error) {
            console.error('Failed to load user:', error);
            //FIXED: keep the token on network errors so the session survives
            //The token is removed only on an explicit 401
            this.currentUser = null;
            window.discordUser = null;
            this.updateUI();
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Login via Discord
     */
    loginWithDiscord() {
        //Pass pathname + query string for redirect
        const returnPath = window.location.pathname + window.location.search + window.location.hash;

        //Add origin as separate parameter for backend
        const currentOrigin = window.location.origin;
        const authUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUTH_DISCORD}?returnUrl=${encodeURIComponent(returnPath)}&origin=${encodeURIComponent(currentOrigin)}`;

        console.log(' Discord OAuth redirect:', authUrl);
        console.log(' Return path:', returnPath);
        console.log(' Origin:', currentOrigin);

        window.location.href = authUrl;
    }

    /**
     * Logout
     */
    async logout() {
        try {
            await apiClient.logout();
            this.currentUser = null;
            //Clear window.discordUser on logout
            window.discordUser = null;
            this.updateUI();
            this.notifyListeners('logout');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    /**
     * Check authentication
     * UPDATED: Check for both Discord (legacy) and Farcaster (new) tokens
     */
    isAuthenticated() {
        // Check for Discord user (legacy)
        if (this.currentUser) {
            return true;
        }

        // Check for Farcaster token (new system)
        const farcasterToken = localStorage.getItem('authToken');
        if (farcasterToken) {
            return true;
        }

        // Check apiClient token
        if (apiClient && apiClient.isAuthenticated()) {
            return true;
        }

        return false;
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Update authorization button UI
     */
    updateUI() {
        const authButton = document.getElementById('authButton');
        const authStatus = document.getElementById('authStatus');

        if (!authButton || !authStatus) return;

        //Remove all old handlers by cloning element
        const newButton = authButton.cloneNode(true);
        authButton.parentNode.replaceChild(newButton, authButton);
        const button = document.getElementById('authButton');
        const status = document.getElementById('authStatus');

        if (this.currentUser) {
            //User is authorized - show avatar and username
            const avatarUrl = this.currentUser.avatar
                ? `https://cdn.discordapp.com/avatars/${this.currentUser.discord_id}/${this.currentUser.avatar}.png?size=32`
                : `https://cdn.discordapp.com/embed/avatars/${parseInt(this.currentUser.discord_id) % 5}.png`;

            status.innerHTML = `
                <img src="${avatarUrl}"
                     style="width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; vertical-align: middle;"
                     alt="Avatar">
                <span>${this.currentUser.username}</span>
            `;
            button.classList.add('connected');
            button.classList.remove('discord-button');

            //Add handler for showing menu
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleUserMenu();
            });
        } else {
            //User is not authorized - show Discord button
            status.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px; vertical-align: middle;">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span>Login with Discord</span>
            `;
            button.classList.remove('connected');
            button.classList.add('discord-button');

            //Add handler for login
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.loginWithDiscord();
            });
        }
    }

    /**
     * Toggle user menu
     */
    toggleUserMenu() {
        const existingMenu = document.getElementById('userMenu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }
        this.showUserMenu();
    }

    /**
     * Show user menu
     */
    showUserMenu() {
        //Create temporary menu
        const existingMenu = document.getElementById('userMenu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.id = 'userMenu';
        menu.className = 'dropdown-menu';
        menu.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            background: linear-gradient(135deg, rgba(0, 17, 34, 0.98) 0%, rgba(0, 51, 102, 0.95) 100%);
            border: 2px solid rgba(0, 221, 255, 0.5);
            border-radius: 12px;
            padding: 10px;
            z-index: 9999;
            min-width: 200px;
        `;

        menu.innerHTML = `
            <div style="padding: 10px; border-bottom: 1px solid rgba(0, 221, 255, 0.3); display: flex; align-items: center; gap: 10px;">
                ${this.currentUser.avatar
                    ? `<img src="https://cdn.discordapp.com/avatars/${this.currentUser.discord_id}/${this.currentUser.avatar}.png"
                           style="width: 32px; height: 32px; border-radius: 50%;" alt="Avatar">`
                    : '<div style="width: 32px; height: 32px; border-radius: 50%; background: #00ddff;"></div>'
                }
                <div>
                    <div style="font-weight: bold; color: #00ddff;">${this.currentUser.username}</div>
                    <div style="font-size: 12px; opacity: 0.7;">Discord User</div>
                </div>
            </div>
            <button onclick="authManager.showProfile()" class="menu-item" style="width: 100%; text-align: left; background: none; border: none; color: #00ddff; padding: 12px; cursor: pointer; border-bottom: 1px solid rgba(0, 221, 255, 0.2);">
                 My Stats
            </button>
            <button onclick="authManager.logout(); document.getElementById('userMenu').remove();" class="menu-item" style="width: 100%; text-align: left; background: none; border: none; color: #ff6666; padding: 12px; cursor: pointer;">
                 Logout
            </button>
        `;

        document.body.appendChild(menu);

        //Close on click outside menu
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target.id !== 'authButton') {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    }

    /**
     * Show user profile
     */
    async showProfile() {
        const menu = document.getElementById('userMenu');
        if (menu) menu.remove();

        try {
            const stats = await apiClient.get(`/api/users/${this.currentUser.id}/stats`);
            const rank = await apiClient.getMyRank();

            alert(` Your Stats:\n\n` +
                ` Best Score: ${stats.best_score || 0}\n` +
                ` Total Games: ${stats.total_games || 0}\n` +
                ` Rank: #${rank.rank || 'N/A'}\n` +
                ` Max Level: ${stats.max_level_reached || 0}`
            );
        } catch (error) {
            console.error('Failed to load stats:', error);
            alert('Failed to load statistics');
        }
    }

    /**
     * Show authentication error
     */
    showAuthError(reason) {
        let message = 'Authentication failed';

        switch (reason) {
            case 'no_code':
                message = 'Discord authorization was cancelled';
                break;
            case 'server_error':
                message = 'Server error during authentication';
                break;
            default:
                message = `Authentication error: ${reason}`;
        }

        alert(` ${message}`);
    }

    /**
     * Add authorization event listener
     */
    addListener(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notify listeners
     */
    notifyListeners(event, data) {
        this.listeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Listener error:', error);
            }
        });
    }
}

//Create global instance only if it doesn't exist yet
if (!window.authManager) {
    window.authManager = new AuthManager();
}


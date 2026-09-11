//Authentication Manager
//Keeps the signed-in player (from a saved API token) and the auth button UI

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
                this.updateUI();
                this.notifyListeners('login', this.currentUser);
                return true;
            } else {
                //FIXED: do not drop the token right away, allow a retry
                //Invalid token - keeping for retry
                console.warn('Failed to load user data, but keeping token for retry');
                this.currentUser = null;
                this.updateUI();
                return false;
            }
        } catch (error) {
            console.error('Failed to load user:', error);
            //FIXED: keep the token on network errors so the session survives
            //The token is removed only on an explicit 401
            this.currentUser = null;
            this.updateUI();
            return false;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Logout
     */
    async logout() {
        try {
            await apiClient.logout();
            this.currentUser = null;
            this.updateUI();
            this.notifyListeners('logout');
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    /**
     * Check authentication: a loaded user or a saved API token
     */
    isAuthenticated() {
        if (this.currentUser) {
            return true;
        }

        if (localStorage.getItem('authToken')) {
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
            //Signed in - show the player name
            status.textContent = this.currentUser.username;
            button.classList.add('connected');

            //Add handler for showing menu
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleUserMenu();
            });
        } else {
            //Guest - nothing to sign in with on the web
            status.textContent = 'Guest';
            button.classList.remove('connected');
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
                <div style="width: 32px; height: 32px; border-radius: 50%; background: #00ddff;"></div>
                <div>
                    <div style="font-weight: bold; color: #00ddff;">${this.currentUser.username}</div>
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


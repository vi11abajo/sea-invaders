//STATE MANAGER
//frominbut inand state atand

class StateManager {
    constructor() {
        this.state = {
            //Game state
            game: {
                score: 0,
                lives: 5,
                level: 1,
                status: 'menu', //'menu', 'playing', 'paused', 'gameOver'
                scoreAlreadySaved: false,
                currentSession: null,
                highScore: 0
            },

            //Tournament state
            tournament: {
                isActive: false,
                registered: false,
                attemptsLeft: 3,
                attemptsUsed: 0,
                playerName: null,
                currentTournamentId: null,
                bestScore: 0,
                timeLeft: 0
            },

            //Boosts state
            boosts: {
                active: new Map(),
                dropping: [],
                speedTamerStacks: 0
            },

            //Boss state
            boss: {
                active: false,
                type: null,
                health: 0,
                maxHealth: 0,
                phase: 1
            },

            //UI state
            ui: {
                modalOpen: null, //'gameStart', 'gameOver', null
                loading: false,
                loadingMessage: '',
                notification: null,
                menuOpen: false
            },

            //Performance state
            performance: {
                fps: 60,
                frameTime: 0,
                optimizationLevel: 'normal' //'low', 'normal', 'high'
            }
        };

        //andtoand on fromNOTand
        this.listeners = new Map();

        //and fromNOTand (for fromtoand)
        this.history = [];
        this.historyLimit = 50;

        //Initialization
        this.loadFromStorage();
    }

    //========================================
    //withbutin method
    //========================================

    /**
     * Get state  path
     * @param {string} path - path to onand (onat, 'game.score')
     * @returns {any} value
     */
    getState(path) {
        if (!path) return this.state;

        const keys = path.split('.');
        let value = this.state;

        for (const key of keys) {
            if (value === undefined || value === null) return undefined;
            value = value[key];
        }

        return value;
    }

    /**
     * Set state  path
     * @param {string} path - path to onand
     * @param {any} value - butin value
     */
    setState(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();

        //oninandand to in object
        let target = this.state;
        for (const key of keys) {
            if (!target[key]) target[key] = {};
            target = target[key];
        }

        const oldValue = target[lastKey];

        //NOT Updating if value NOT fromandwith
        if (oldValue === value) return;

        //Setting butin value
        target[lastKey] = value;

        //Adding in and
        this.addToHistory(path, oldValue, value);

        //into andtoin
        this.notify(path, value, oldValue);

        //Saving in localStorage (for NOTtofrom )
        this.persistState(path);
    }

    /**
     * Update NOTwithtoto onand  
     * @param {Object} updates - object with butinandand { 'game.score': 100, 'game.lives': 3 }
     */
    batchUpdate(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            this.setState(path, value);
        });
    }

    /**
     * withwithand state game
     */
    resetGameState() {
        this.batchUpdate({
            'game.score': 0,
            'game.lives': 5,
            'game.level': 1,
            'game.status': 'menu',
            'game.scoreAlreadySaved': false,
            'game.currentSession': null
        });

        //Clearing boost
        this.state.boosts.active.clear();
        this.state.boosts.dropping = [];
        this.state.boosts.speedTamerStacks = 0;

        //withwithin boss
        this.batchUpdate({
            'boss.active': false,
            'boss.type': null,
            'boss.health': 0,
            'boss.maxHealth': 0,
            'boss.phase': 1
        });
    }

    //========================================
    //toand
    //========================================

    /**
     * with on fromNOTand
     * @param {string} path - path for fromwithandinand
     * @param {Function} callback - function but inin (newValue, oldValue)
     * @returns {Function} function fromtoand
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }

        this.listeners.get(path).push(callback);

        //inin toand fromtoand
        return () => {
            const callbacks = this.listeners.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * intoand andtoin  fromNOTandand
     * @param {string} path - path tofrom fromandwith
     * @param {any} newValue - butin value
     * @param {any} oldValue - with value
     */
    notify(path, newValue, oldValue) {
        //into andtoin
        const callbacks = this.listeners.get(path);
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(newValue, oldValue, path);
                } catch (error) {
                    console.error(`Error in state listener for '${path}':`, error);
                }
            });
        }

        //into andwithtoand path (onat, if fromandwith 'game.score', into 'game')
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            const parentCallbacks = this.listeners.get(parentPath);

            if (parentCallbacks) {
                const parentValue = this.getState(parentPath);
                parentCallbacks.forEach(cb => {
                    try {
                        cb(parentValue, parentValue, path);
                    } catch (error) {
                        console.error(`Error in parent state listener for '${parentPath}':`, error);
                    }
                });
            }
        }
    }

    //========================================
    //and
    //========================================

    /**
     * Add fromNOTand in and
     */
    addToHistory(path, oldValue, newValue) {
        this.history.push({
            timestamp: Date.now(),
            path: path,
            oldValue: oldValue,
            newValue: newValue
        });

        //andandin andand
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }

    /**
     * Get and fromNOTand
     * @param {string} path - path for andandand (andonbut)
     * @returns {Array} and fromNOTand
     */
    getHistory(path = null) {
        if (!path) return this.history;
        return this.history.filter(entry => entry.path === path);
    }

    /**
     * Clear and
     */
    clearHistory() {
        this.history = [];
    }

    //========================================
    //PERSISTENCE (localStorage)
    //========================================

    /**
     * Save state in localStorage
     */
    persistState(path) {
        //Saving to path
        const persistPaths = [
            'game.highScore',
            'tournament.playerName',
            'performance.optimizationLevel'
        ];

        if (persistPaths.includes(path)) {
            try {
                const value = this.getState(path);
                localStorage.setItem(`state_${path}`, JSON.stringify(value));
            } catch (error) {
                console.error('Error persisting state:', error);
            }
        }
    }

    /**
     * Load state from localStorage
     */
    loadFromStorage() {
        const persistPaths = [
            'game.highScore',
            'tournament.playerName',
            'performance.optimizationLevel'
        ];

        persistPaths.forEach(path => {
            try {
                const stored = localStorage.getItem(`state_${path}`);
                if (stored !== null) {
                    const value = JSON.parse(stored);

                    //Setting intoand ( onon Loading)
                    const keys = path.split('.');
                    const lastKey = keys.pop();
                    let target = this.state;
                    for (const key of keys) {
                        if (!target[key]) target[key] = {};
                        target = target[key];
                    }
                    target[lastKey] = value;
                }
            } catch (error) {
                console.error(`Error loading state for '${path}':`, error);
            }
        });
    }

    //========================================
    //or
    //========================================

    /**
     * Get withandto inwith states
     */
    getSnapshot() {
        return JSON.parse(JSON.stringify(this.state));
    }

    /**
     * inwithwithbutinand state from withandto
     */
    restoreSnapshot(snapshot) {
        this.state = JSON.parse(JSON.stringify(snapshot));

        //into inwith andtoin but butinandand
        this.listeners.forEach((callbacks, path) => {
            const value = this.getState(path);
            callbacks.forEach(cb => cb(value, value, path));
        });
    }

    /**
     * ininwithand state in towith (for fromtoand)
     */
    debug() {
        console.group(' State Manager Debug');
        console.groupEnd();
    }
}

//Creating global instance
window.stateManager = new StateManager();

//towithand for inand in
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateManager;
}

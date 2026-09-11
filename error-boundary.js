//ERROR BOUNDARY
//frominon fromto andto atand

class ErrorBoundary {
    constructor() {
        this.handlers = new Map();
        this.errorLog = [];
        this.maxLogSize = 100;
        this.isHandlingError = false; //for toinand withtoNOTbut andto

        //settings
        this.config = {
            showNotifications: true,
            logToConsole: true,
            logToStorage: true,
            reporttoServer: false //can intoand for fromintoand on server
        };

        //Initialization
        this.setupGlobalHandlers();
        this.loadErrorLog();
    }

    //========================================
    //registration handlerin
    //========================================

    /**
     * registration handler for totobut 
     * @param {string} zone - zone name ('game', 'tournament', etc.)
     * @param {Function} handler - handler (error, context) => Promise<void>
     */
    register(zone, handler) {
        this.handlers.set(zone, handler);
    }

    /**
     * yesand handler
     * @param {string} zone - on
     */
    unregister(zone) {
        this.handlers.delete(zone);
    }

    //========================================
    //fromto andto
    //========================================

    /**
     * from andto
     * @param {Error} error - object andtoand
     * @param {string} zone - on inandtobutinand
     * @param {Object} context - toand totowith
     */
    handleError(error, zone = 'global', context = {}) {
        //defense from withtoNOTbut andto
        if (this.isHandlingError) {
            console.warn('[ErrorBoundary] Recursive error detected, skipping');
            return;
        }

        this.isHandlingError = true;

        try {
            //logging
            if (this.config.logToConsole) {
                console.error(`[${zone}] Error:`, error, context);
            }

            //Adding in
            this.addToLog(error, zone, context);

            //with from withandand handler
            const handler = this.handlers.get(zone);
            if (handler) {
                try {
                    const result = handler(error, context);
                    //if handler inin Promise, NOT
                    if (result && typeof result.then === 'function') {
                        result.catch((handlerError) => {
                            console.error(`Error in error handler for '${zone}':`, handlerError);
                        });
                    }
                } catch (handlerError) {
                    console.error(`Error in error handler for '${zone}':`, handlerError);
                }
            }

            //on fromto
            this.defaultHandler(error, zone, context);
        } catch (err) {
            console.error('[ErrorBoundary] Critical error in handleError:', err);
        } finally {
            //withwithin NOT to
            setTimeout(() => {
                this.isHandlingError = false;
            }, 100);
        }
    }

    /**
     *  handler
     */
    defaultHandler(error, zone, context) {
        //Getting but withand for in
        const userMessage = this.getUserFriendlyMessage(error, zone);

        //whilein intoand
        if (this.config.showNotifications && window.showNotification) {
            window.showNotification(userMessage, 'error', 5000);
        }

        //Sending on server (if intobut)
        if (this.config.reportToServer) {
            this.reportToServer(error, zone, context);
        }
    }

    //========================================
    //WRAPPER for toand
    //========================================

    /**
     *  async toand for fromtoand andto
     * @param {Function} fn - function
     * @param {string} zone - on
     * @param {Object} options - options
     * @returns {Function}  function
     */
    wrap(fn, zone, options = {}) {
        const { rethrow = false, fallback = null } = options;

        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                await this.handleError(error, zone, {
                    args,
                    functionName: fn.name
                });

                if (rethrow) {
                    throw error;
                }

                return fallback;
            }
        };
    }

    /**
     *  sync toand
     */
    wrapSync(fn, zone, options = {}) {
        const { rethrow = false, fallback = null } = options;

        return (...args) => {
            try {
                return fn(...args);
            } catch (error) {
                this.handleError(error, zone, {
                    args,
                    functionName: fn.name
                });

                if (rethrow) {
                    throw error;
                }

                return fallback;
            }
        };
    }

    //========================================
    //handlerand
    //========================================

    /**
     * onwithto  handlerin
     */
    setupGlobalHandlers() {
        //NOTfrom
        window.addEventListener('unhandledrejection', (event) => {
            event.preventDefault();

            //withyes andto from event.reason
            let error;
            if (event.reason instanceof Error) {
                error = event.reason;
            } else if (typeof event.reason === 'object' && event.reason !== null) {
                error = new Error(`Unhandled promise rejection: ${JSON.stringify(event.reason)}`);
            } else {
                error = new Error(`Unhandled promise rejection: ${String(event.reason)}`);
            }

            this.handleError(error, 'promise', {
                promise: event.promise,
                reason: event.reason
            });
        });

        //JavaScript andtoand
        window.addEventListener('error', (event) => {
            //withto andtoand toand withwithin
            if (event.target !== window) {
                return;
            }

            this.handleError(
                event.error || new Error(event.message),
                'javascript',
                {
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                }
            );
        });
    }

    //========================================
    //withand for in
    //========================================

    /**
     * Get but withand for in
     */
    getUserFriendlyMessage(error, zone) {
        //withandand to andto
        const errorCodes = {
            //Game errors
            'game_already_running': 'Game is already running',

            //Tournament errors
            'tournament_not_active': 'Tournament is not active',
            'tournament_not_registered': 'Please register for tournament first',
            'tournament_no_attempts': 'No tournament attempts left',
            'player_name_required': 'Player name is required',

            //Network errors
            'network_error': 'Network error. Please check your connection',
            'timeout': 'Request timeout. Please try again'
        };

        //Checking to andtoand
        if (error.code && errorCodes[error.code]) {
            return errorCodes[error.code];
        }

        //Checking withand andtoand
        const message = error.message?.toLowerCase() || '';

        if (message.includes('network') || message.includes('connection')) {
            return 'Network error. Please check your connection';
        }

        if (message.includes('timeout')) {
            return 'Request timeout. Please try again';
        }

        //but withand on
        const zoneMessages = {
            game: 'Game error. Please restart the game',
            tournament: 'Tournament error. Please try again'
        };

        if (zoneMessages[zone]) {
            return zoneMessages[zone];
        }

        //withand
        return 'An error occurred. Please try again';
    }

    //========================================
    //andinand
    //========================================

    /**
     * Add andto in 
     */
    addToLog(error, zone, context) {
        const logEntry = {
            timestamp: Date.now(),
            zone: zone,
            message: error.message,
            stack: error.stack,
            code: error.code,
            context: context,
            userAgent: navigator.userAgent,
            url: window.location.href,
            state: window.stateManager ? window.stateManager.getSnapshot() : null
        };

        this.errorLog.push(logEntry);

        //andandin
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        //Saving in localStorage
        if (this.config.logToStorage) {
            this.saveErrorLog();
        }
    }

    /**
     * Get  andto
     */
    getErrorLog(zone = null) {
        if (!zone) return this.errorLog;
        return this.errorLog.filter(entry => entry.zone === zone);
    }

    /**
     * Clear 
     */
    clearErrorLog() {
        this.errorLog = [];
        if (this.config.logToStorage) {
            localStorage.removeItem('errorLog');
        }
    }

    /**
     * Save  in localStorage
     */
    saveErrorLog() {
        try {
            localStorage.setItem('errorLog', JSON.stringify(this.errorLog));
        } catch (error) {
            console.error('Failed to save error log:', error);
        }
    }

    /**
     * Load  from localStorage
     */
    loadErrorLog() {
        try {
            const stored = localStorage.getItem('errorLog');
            if (stored) {
                this.errorLog = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load error log:', error);
            this.errorLog = [];
        }
    }

    //========================================
    //frominto on server
    //========================================

    /**
     * Send andto on server
     */
    async reportToServer(error, zone, context) {
        //can andandin Sentry, LogRocket and ..
        //while with to
    }

    //========================================
    //or
    //========================================

    /**
     * Get withandto andto
     */
    getStatistics() {
        const stats = {
            total: this.errorLog.length,
            byZone: {},
            byCode: {},
            last24h: 0
        };

        const day = 24 * 60 * 60 * 1000;
        const now = Date.now();

        this.errorLog.forEach(entry => {
            //on
            stats.byZone[entry.zone] = (stats.byZone[entry.zone] || 0) + 1;

            //toyes
            if (entry.code) {
                stats.byCode[entry.code] = (stats.byCode[entry.code] || 0) + 1;
            }

            //afterand 24 with
            if (now - entry.timestamp < day) {
                stats.last24h++;
            }
        });

        return stats;
    }

    /**
     * ininwithand from in towith
     */
    debug() {
        console.group(' Error Boundary Debug');
        console.groupEnd();
    }
}

//Creating global instance
window.errorBoundary = new ErrorBoundary();

//towithand
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorBoundary;
}

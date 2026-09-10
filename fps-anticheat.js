//FPS ANTI-CHEAT SYSTEM
//toin towithand fromto FPS for and game
//toand withto game on with withwithin (to and)

class FPSAntiCheat {
    constructor() {
        this.lowFpsGameEndShown = false;
        this.isEnabled = true;

        //in onand FPS
        this.MIN_FPS_to_START = 40;  //andand FPS for on game
        this.MIN_FPS_DURING_GAME = 30; //andand FPS in in game

        //for withwith at butin and
        this.resetOnNewGame();
    }

    /**
     * Check, inwith and withwithin and
     * @returns {boolean} true if andbut withwithin
     */
    isMobileDevice() {
        return /iphone|ipad|ipod|android|webos|blackberry|iemobile|opera mini/i.test(
            navigator.userAgent.toLowerCase()
        );
    }

    /**
     * Get current FPS from scoreandto
     * @returns {number} current FPS
     */
    getCurrentFPS() {
        if (window.fpsCounterData && typeof window.fpsCounterData.fps === 'number') {
            return window.fpsCounterData.fps;
        }
        return 60; //by default withand FPS but
    }

    /**
     * Create HTML withand for intoand
     * @returns {string} HTML withand
     */
    createWarningMessage() {
        return `
            <p style="margin-bottom: 15px;">It looks like your device is too weak to fight off the crab invasion.</p>
            <p style="margin-bottom: 15px;"> <strong>Try this fix:</strong></p>
            <p style="margin-bottom: 8px;">Enable <strong>"Use hardware acceleration when available"</strong> in your browser settings.</p>
            <p style="font-size: 16px; opacity: 0.9;">
                <strong>Chrome:</strong> Settings → System → Use hardware acceleration when available
            </p>
        `;
    }

    /**
     * while toandandwithto intoand  fromto FPS
     * @param {string} title - into
     * @param {string} message - withand
     */
    async showLowFPSNotification(title, message) {
        if (window.showCriticalNotification) {
            await showCriticalNotification(title, message);
        } else {
            alert('It looks like your device is too weak to fight off the crab invasion. Try enabling hardware acceleration in your browser.');
        }
    }

    /**
     * andyesand butinand FPS scoreandto
     * @param {number} timeout - towithandbut in andyesand in with
     * @returns {Promise<number>} Promise with toand FPS
     */
    async waitForFPSUpdate(timeout = 1000) {
        const startTime = Date.now();

        //while FPS butinandwith from and
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const fps = this.getCurrentFPS();
                const elapsed = Date.now() - startTime;

                //if FPS butinandwith (NOT 60 by default) or in
                if (fps !== 60 || elapsed >= timeout) {
                    clearInterval(checkInterval);
                    resolve(fps);
                }
            }, 100);
        });
    }

    /**
     * Check FPS  on game
     * @returns {boolean} true if can on and, false if FPS withandto fromtoand
     */
    async checkBeforeGameStart() {
        //withto into for and withwithin
        if (this.isMobileDevice()) {
            return true;
        }

        //withto if andand DISABLED
        if (!this.isEnabled) {
            return true;
        }

        //butinand FPS scoreandto (but with 1500ms to 500ms)
        const currentFPS = await this.waitForFPSUpdate(500);

        if (currentFPS < this.MIN_FPS_TO_START) {
            const title = ' LOW PERFORMANCE DETECTED';
            const message = this.createWarningMessage();

            await this.showLowFPSNotification(title, message);

            return false; //toand withto game
        }

        return true; //withto game
    }

    /**
     * Check FPS in in game (ininwith in gameLoop)
     * @param {string} gameState - to state game
     * @param {number} currentFPS - current FPS
     * @returns {boolean} true if and need inand, false if inwith to
     */
    checkDuringGameplay(gameState, currentFPS) {
        //withto into for and withwithin
        if (this.isMobileDevice()) {
            return false;
        }

        //withto if andand DISABLED
        if (!this.isEnabled) {
            return false;
        }

        //Checking to if game in withwith
        if (gameState !== 'playing') {
            return false;
        }

        //Checking FPS
        if (currentFPS < this.MIN_FPS_DURING_GAME) {
            //for toinand in intoand
            if (!this.lowFpsGameEndShown) {
                this.lowFpsGameEndShown = true;

                const title = ' LOW PERFORMANCE DETECTED';
                const message = this.createWarningMessage();

                //whilein intoand withandbut (NOT toand inNOTand)
                this.showLowFPSNotification(title, message);

                return true; //withandon inand and
            }
        }

        return false;
    }

    /**
     * withwith in at on butin game
     */
    resetOnNewGame() {
        this.lowFpsGameEndShown = false;
    }

    /**
 * intoand/intoand andand
 * @param {boolean} enabled - true for intoand, false for intoand
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
    }

    /**
     * Get status andand
     * @returns {Object} object with andformand  withwithandand
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            isMobile: this.isMobileDevice(),
            currentFPS: this.getCurrentFPS(),
            minFPSToStart: this.MIN_FPS_TO_START,
            minFPSDuringGame: this.MIN_FPS_DURING_GAME,
            lowFpsGameEndShown: this.lowFpsGameEndShown
        };
    }
}

//Creating global instance
if (!window.fpsAntiCheat) {
    window.fpsAntiCheat = new FPSAntiCheat();
}

//towith for inand in
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FPSAntiCheat;
}

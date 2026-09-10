//Game Session Manager
//inand andinand withwithwithandand and within with backend

class GameSessionManager {
    constructor() {
        this.currentSession = null;
        this.heartbeatInterval = null;
        this.gameEvents = [];
        this.sessionStartTime = null;
    }

    /**
     * on butin andin withwithwithand
     */
    async startSession(gameMode = 'classic', tournamentId) {
        //Checking infromand
        if (!authManager.isAuthenticated()) {
            return null;
        }

        try {

            //yes tournamentId to if
            const response = tournamentId !== undefined
                ? await apiClient.startSession(gameMode, tournamentId)
                : await apiClient.startSession(gameMode);

            if (response && response.sessionId) {
                this.currentSession = {
                    sessionId: response.sessionId,
                    gameMode: response.gameMode,
                    tournamentId: response.tournamentId,
                };

                this.sessionStartTime = Date.now();
                this.gameEvents = [];

                //Start heartbeat
                this.startHeartbeat();

                return this.currentSession;
            }

            return null;
        } catch (error) {
            console.warn('⚠️ Failed to start session:', error.message || error);
            return null;
        }
    }

    /**
     * Start heartbeat (to 10 withto)
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(async () => {
            if (this.currentSession) {
                try {
                    await apiClient.sendHeartbeat(
                        this.currentSession.sessionId,
                        this.gameEvents.slice(-50) //afterand 50 withand
                    );
                } catch (error) {
                    console.warn('⚠️ Heartbeat failed:', error.message || error);
                }
            }
        }, API_CONFIG.SETTINGS.HEARTBEAT_INTERVAL);
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Add andin event
     */
    addGameEvent(eventType, data) {
        const event = {
            type: eventType,
            timestamp: Date.now() - (this.sessionStartTime || Date.now()),
            data,
        };

        this.gameEvents.push(event);

        //and to afterand 100 withand
        if (this.gameEvents.length > 100) {
            this.gameEvents.shift();
        }
    }

    /**
     * Send andon result
     */
    async submitScore(scoreData) {
        if (!this.currentSession) {
            console.warn('⚠️ No active session - score will not be saved to server');
            return { success: false, error: 'No active session' };
        }

        if (!authManager.isAuthenticated()) {
            console.warn('⚠️ User not authenticated - score will not be saved to server');
            return { success: false, error: 'Not authenticated' };
        }

        try {

            const gameDuration = Date.now() - this.sessionStartTime;

            const submitData = {
                sessionId: this.currentSession.sessionId,
                score: scoreData.score,
                level: scoreData.level,
                duration: gameDuration, //in andtoyes
                enemiesKilled: scoreData.enemiesKilled || 0,
                accuracy: scoreData.accuracy || 0,
            };


            const response = await apiClient.submitScore(submitData);

            if (response && response.success) {
                this.stopHeartbeat();
                this.currentSession = null;
                return { success: true, data: response.score };
            }

            return { success: false, error: 'Submit failed' };
        } catch (error) {
            console.warn('⚠️ Failed to submit score:', error.message || error);
            return {
                success: false,
                error: error.message || 'Server error',
            };
        }
    }

    /**
     * Get to withwithwithand
     */
    getCurrentSession() {
        return this.currentSession;
    }

    /**
     * Check onandand toandinbut withwithwithandand
     */
    hasActiveSession() {
        return !!this.currentSession;
    }

    /**
     * inand withwithwithand  fromintoand result
     */
    endSession() {
        this.stopHeartbeat();
        this.currentSession = null;
        this.gameEvents = [];
        this.sessionStartTime = null;
    }
}

//Creating global instance
window.gameSessionManager = new GameSessionManager();


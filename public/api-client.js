//API Client for backend communication
//Centralized client for all HTTP requests

class APIClient {
    constructor() {
        this.baseURL = API_CONFIG.BASE_URL;
        this.token = localStorage.getItem('authToken');

        //Cache for data (with timestamps)
        this.cache = new Map();

        //Retry settings
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000, //1 second
            maxDelay: 10000, //10 seconds
            retryableErrors: ['TooManyRequests', 'NetworkError', 'TimeoutError']
        };
    }

    /**
     * Get authorization token
     */
    getToken() {
        return this.token || localStorage.getItem('authToken');
    }

    /**
     * Set authorization token
     */
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('authToken', token);
        } else {
            localStorage.removeItem('authToken');
        }
    }

    /**
     * Check authorization
     */
    isAuthenticated() {
        return !!this.getToken();
    }

    /**
     * Get data from cache if it's fresh
     */
    getCachedData(key, maxAge = 30000) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > maxAge) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * Save data to cache
     */
    setCachedData(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache (all or by key)
     */
    clearCache(key = null) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Clear leaderboard cache (for refresh after score submission)
     */
    clearLeaderboardCache() {
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (key.includes('leaderboard_')) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Exponential backoff delay
     */
    async exponentialDelay(attempt) {
        const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt),
            this.retryConfig.maxDelay
        );
        //Add jitter (randomness) to prevent synchronized retries
        const jitter = Math.random() * 0.3 * delay;
        const totalDelay = delay + jitter;

        await new Promise(resolve => setTimeout(resolve, totalDelay));
    }

    /**
     * Check if request can be retried
     */
    isRetryableError(error) {
        if (!error) return false;

        //Check by message
        const errorMessage = error.message || '';
        if (this.retryConfig.retryableErrors.some(err => errorMessage.includes(err))) {
            return true;
        }

        //Check by error name
        const errorName = error.name || '';
        if (this.retryConfig.retryableErrors.some(err => errorName.includes(err))) {
            return true;
        }

        return false;
    }

    /**
     * HTTP request with automatic retries
     */
    async requestWithRetry(endpoint, options = {}, retries = null) {
        const maxRetries = retries !== null ? retries : this.retryConfig.maxRetries;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.request(endpoint, options);
            } catch (error) {
                const isLastAttempt = attempt === maxRetries;

                //if this is the last attempt or error is not retryable - throw
                if (isLastAttempt || !this.isRetryableError(error)) {
                    throw error;
                }

                //Log retry
                //console.warn(` Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying...`, {
                //endpoint,
                //error: error.message
                //});

                //Wait with exponential backoff
                await this.exponentialDelay(attempt);
            }
        }
    }

    /**
     * Core method for HTTP requests
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = this.getToken();

        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (token && !options.skipAuth) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers,
        };

        try {
            const response = await fetch(url, config);

            //if 401, token expired
            if (response.status === 401) {
                this.setToken(null);
                //Can add redirect to login page
                return null;
            }

            //if not JSON, return text
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                return await response.text();
            }

            const data = await response.json();

            if (!response.ok) {
                //Don't log 404 "Endpoint not found" - it's normal for non-existent endpoints
                const isEndpointNotFound = response.status === 404 && data.message === 'Endpoint not found';

                if (!isEndpointNotFound) {
                    console.error(' Server response:', data);
                    if (data.details && data.details.length > 0) {
                        console.error(' Validation errors:', data.details);
                    }
                }

                throw new Error(data.message || `HTTP Error ${response.status}`);
            }

            return data;
        } catch (error) {
            //Don't log "Endpoint not found" errors
            if (!error.message || !error.message.includes('Endpoint not found')) {
                console.error(` API Error (${endpoint}):`, error);
            }
            throw error;
        }
    }

    /**
     * GET request
     */
    async get(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'GET',
        });
    }

    /**
     * POST request
     */
    async post(endpoint, body, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * PATCH request
     */
    async patch(endpoint, body, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(body),
        });
    }

    /**
     * DELETE request
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE',
        });
    }

    //====================================
    //AUTH METHODS
    //====================================

    /**
     * Get current user
     */
    async getCurrentUser() {
        try {
            return await this.get(API_CONFIG.ENDPOINTS.AUTH_ME);
        } catch (error) {
            console.error('Failed to get current user:', error);
            return null;
        }
    }

    /**
     * Logout
     */
    async logout() {
        try {
            await this.post(API_CONFIG.ENDPOINTS.AUTH_LOGOUT);
            this.setToken(null);
            return true;
        } catch (error) {
            console.error('Logout failed:', error);
            return false;
        }
    }

    //====================================
    //GAME SESSION METHODS
    //====================================

    /**
     * Start game session
     */
    async startSession(gameMode = 'classic', tournamentId) {
        const body = { gameMode };

        //Add tournamentId only if it's provided
        if (tournamentId !== undefined) {
            body.tournamentId = tournamentId;
        }

        return await this.post(API_CONFIG.ENDPOINTS.SESSION_START, body);
    }

    /**
     * Send heartbeat (with retry logic)
     */
    async sendHeartbeat(sessionId, events = []) {
        return await this.requestWithRetry(
            API_CONFIG.ENDPOINTS.SESSION_HEARTBEAT,
            {
                method: 'POST',
                body: JSON.stringify({
                    sessionId,
                    events,
                })
            },
            2 //Only 2 attempts for heartbeat (not critical)
        );
    }

    /**
     * Send final result (with cache clearing)
     */
    async submitScore(scoreData) {
        const result = await this.post(API_CONFIG.ENDPOINTS.SCORE_SUBMIT, scoreData);

        //Clear leaderboard cache after score submission
        this.clearLeaderboardCache();

        return result;
    }

    /**
     * Get own results
     */
    async getMyScores(limit = 10) {
        return await this.get(`${API_CONFIG.ENDPOINTS.MY_SCORES}?limit=${limit}`);
    }

    //====================================
    //LEADERBOARD METHODS
    //====================================

    /**
     * Get leaderboard (universal method)
     */
    async getLeaderboard(type = 'main', limit = 100) {
        if (type === 'main') {
            return await this.getMainLeaderboard(limit);
        } else {
            return await this.getTournamentLeaderboard(type, limit);
        }
    }

    /**
     * Get main leaderboard (with caching)
     */
    async getMainLeaderboard(limit = 100, offset = 0) {
        const cacheKey = `leaderboard_main_${limit}_${offset}`;

        //Check cache (30 seconds)
        const cached = this.getCachedData(cacheKey, 30000);
        if (cached) {
            return cached;
        }

        //request with retry logic
        const data = await this.requestWithRetry(
            `${API_CONFIG.ENDPOINTS.LEADERBOARD_MAIN}?limit=${limit}&offset=${offset}`,
            { method: 'GET' },
            2 //2 attempts for leaderboard
        );

        //Save to cache
        if (data) {
            this.setCachedData(cacheKey, data);
        }

        return data;
    }

    /**
     * Get tournament leaderboard (with caching)
     */
    async getTournamentLeaderboard(tournamentId, limit = 100) {
        const cacheKey = `leaderboard_tournament_${tournamentId}_${limit}`;

        //Check cache (30 seconds)
        const cached = this.getCachedData(cacheKey, 30000);
        if (cached) {
            return cached;
        }

        //request with retry logic
        const data = await this.requestWithRetry(
            `${API_CONFIG.ENDPOINTS.LEADERBOARD_TOURNAMENT}/${tournamentId}?limit=${limit}`,
            { method: 'GET' },
            2 //2 attempts for leaderboard
        );

        //Save to cache
        if (data) {
            this.setCachedData(cacheKey, data);
        }

        return data;
    }

    /**
     * Get top players
     */
    async getTopPlayers(sortBy = 'best_score', limit = 100) {
        return await this.get(
            `${API_CONFIG.ENDPOINTS.LEADERBOARD_TOP_PLAYERS}?sortBy=${sortBy}&limit=${limit}`
        );
    }

    /**
     * Get own rank
     */
    async getMyRank() {
        return await this.get(API_CONFIG.ENDPOINTS.MY_RANK);
    }

    //====================================
    //TOURNAMENT METHODS
    //====================================

    /**
     * Get list of tournaments
     */
    async getTournaments(status = null) {
        const url = status
            ? `${API_CONFIG.ENDPOINTS.TOURNAMENTS_LIST}?status=${status}`
            : API_CONFIG.ENDPOINTS.TOURNAMENTS_LIST;
        return await this.get(url);
    }

    /**
     * Get current active tournament
     */
    async getCurrentTournament() {
        return await this.get(API_CONFIG.ENDPOINTS.TOURNAMENT_CURRENT);
    }

    /**
     * Get tournament information
     */
    async getTournamentDetails(tournamentId) {
        return await this.get(`${API_CONFIG.ENDPOINTS.TOURNAMENT_DETAILS}/${tournamentId}`);
    }
}

//Create global instance of API client
window.apiClient = new APIClient();


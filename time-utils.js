//⏰ TIME UTILS
//or for from with inNOT and timerand

window.timeUtils = {
    /**
     * formandinand inand tournament (MM:SS)
     * @param {number} milliseconds - andandseconds
     * @returns {string} fromformandinbut in
     */
    formatTournamentTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    /**
     * formandinand inand with withand (HH:MM:SS)
     */
    formatTimeWithHours(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    /**
     * formandinand yes for leaderboard (frombutwithandbut in)
     */
    formatLeaderboardDate(timestamp) {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now - date;

        //NOT and on
        if (diff < 60000) {
            return 'Just now';
        }

        //NOT with on
        if (diff < 3600000) {
            const minutes = Math.floor(diff / 60000);
            return `${minutes}m ago`;
        }

        //NOT on
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `${hours}h ago`;
        }

        //NOT NOTand on
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return `${days}d ago`;
        }

        //on yes
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    },

    /**
     * formandinand but yes and inand
     */
    formatFullDateTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Create countdown timer
     * @param {number} endTime - in toand (timestamp)
     * @param {Function} callback - function but inin
     * @returns {Function} function toand
     */
    createCountdown(endTime, callback) {
        const update = () => {
            const now = Date.now();
            const remaining = endTime - now;

            if (remaining <= 0) {
                callback({
                    finished: true,
                    remaining: 0,
                    formatted: '0:00',
                    percentage: 0
                });
                return true; //Stop timer
            }

            callback({
                finished: false,
                remaining: remaining,
                formatted: this.formatTournamentTime(remaining),
                percentage: null //can yes andbutwith for score
            });

            return false; //toand timer
        };

        //first inin with
        if (update()) {
            return () => {}; //in
        }

        //Setting interval
        const interval = setInterval(() => {
            if (update()) {
                clearInterval(interval);
            }
        }, 1000);

        //inin toand toand
        return () => clearInterval(interval);
    },

    /**
     * Create timer with and withwith
     * @param {number} startTime - in on
     * @param {number} duration - andbutwith (andandseconds)
     * @param {Function} callback - function but inin
     */
    createProgressTimer(startTime, duration, callback) {
        const endTime = startTime + duration;

        return this.createCountdown(endTime, (data) => {
            if (!data.finished) {
                const elapsed = Date.now() - startTime;
                data.percentage = Math.min(100, (elapsed / duration) * 100);
            }
            callback(data);
        });
    },

    /**
     * Debounce function with timer
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function with timer
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * to (Promise)
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Timeout for Promise
     */
    timeout(promise, ms, errorMessage = 'Operation timeout') {
        return Promise.race([
            promise,
            this.delay(ms).then(() => {
                throw new Error(errorMessage);
            })
        ]);
    },

    /**
     * Retry with towithNOTandbut to
     */
    async retryWithBackoff(fn, maxAttempts = 3, initialDelay = 1000) {
        let lastError;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (attempt < maxAttempts - 1) {
                    const delay = initialDelay * Math.pow(2, attempt);
                    await this.delay(delay);
                }
            }
        }

        throw lastError;
    },

    /**
     * Get timestamp in withtoyes (for blockchain)
     */
    getTimestampSeconds() {
        return Math.floor(Date.now() / 1000);
    },

    /**
     * Check and inand
     */
    isExpired(timestamp, durationMs) {
        return Date.now() > timestamp + durationMs;
    },

    /**
     * Get withinwith in
     */
    getTimeRemaining(endTime) {
        const remaining = endTime - Date.now();
        return Math.max(0, remaining);
    },

    /**
     * formandinand andbutwithand (intobut)
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);

        if (seconds < 60) {
            return `${seconds} seconds`;
        }

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        }

        const hours = Math.floor(minutes / 60);
        if (hours < 24) {
            return `${hours} hour${hours > 1 ? 's' : ''}`;
        }

        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''}`;
    },

    /**
     * FPS timer for andand
     */
    createAnimationTimer(fps = 60) {
        const interval = 1000 / fps;
        let lastTime = Date.now();
        let animationFrameId = null;

        const animate = (callback) => {
            const now = Date.now();
            const delta = now - lastTime;

            if (delta >= interval) {
                lastTime = now - (delta % interval);
                callback(delta);
            }

            animationFrameId = requestAnimationFrame(() => animate(callback));
        };

        return {
            start: (callback) => {
                lastTime = Date.now();
                animate(callback);
            },
            stop: () => {
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
            }
        };
    }
};

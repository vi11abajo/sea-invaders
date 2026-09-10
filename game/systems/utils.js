//SEA INVADERS - UTILITY SYSTEM
//Timer management and utility functions

//Timer management for memory leak prevention
const gameTimers = {
    intervals: new Map(),
    timeouts: new Set()
};

/**
 * Create safe interval with tracking
 */
export function createSafeInterval(callback, delay, name) {
    const intervalId = setInterval(callback, delay);
    if (name) {
        gameTimers.intervals.set(name, intervalId);
    }
    return intervalId;
}

/**
 * Create safe timeout with tracking
 */
export function createSafeTimeout(callback, delay) {
    const timeoutId = setTimeout(() => {
        callback();
        gameTimers.timeouts.delete(timeoutId);
    }, delay);
    gameTimers.timeouts.add(timeoutId);
    return timeoutId;
}

/**
 * Clear all game timers (prevents memory leaks)
 */
export function clearAllGameTimers() {
    //Clear all intervals
    gameTimers.intervals.forEach((intervalId, name) => {
        clearInterval(intervalId);
    });
    gameTimers.intervals.clear();

    //Clear all timeouts
    gameTimers.timeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
    });
    gameTimers.timeouts.clear();
}

/**
 * Get game timers (for debugging)
 */
export function getGameTimers() {
    return gameTimers;
}

/**
 * Random number between min and max
 */
export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Random integer between min and max (inclusive)
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Choose random element from array
 */
export function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

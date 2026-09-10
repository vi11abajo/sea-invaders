/**
 * Simple logger utility
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

export function debug(...args) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
}

export function info(...args) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    console.log('[INFO]', new Date().toISOString(), ...args);
  }
}

export function warn(...args) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    console.warn('[WARN]', new Date().toISOString(), ...args);
  }
}

export function error(...args) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    console.error('[ERROR]', new Date().toISOString(), ...args);
  }
}

export default {
  debug,
  info,
  warn,
  error,
};

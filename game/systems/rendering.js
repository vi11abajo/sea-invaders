//SEA INVADERS - RENDERING SYSTEM
//Optimized rendering functions with shadow caching

import { PERFORMANCE_SETTINGS } from '../core/game-constants.js';

//Canvas rendering optimization cache
const renderCache = {
    lastPlayerShadow: null,
    lastCrabShadow: null,
    shadowsEnabled: PERFORMANCE_SETTINGS.shadowsEnabled
};

/**
 * Set player shadow (cached for performance)
 */
export function setPlayerShadow(ctx) {
    if (renderCache.shadowsEnabled && renderCache.lastPlayerShadow !== '#00ddff') {
        ctx.shadowColor = '#00ddff';
        ctx.shadowBlur = 0;
        renderCache.lastPlayerShadow = '#00ddff';
    }
}

/**
 * Set crab shadow (cached for performance)
 */
export function setCrabShadow(ctx, color) {
    if (renderCache.shadowsEnabled && renderCache.lastCrabShadow !== color) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        renderCache.lastCrabShadow = color;
    }
}

/**
 * Clear all shadows
 */
export function clearShadow(ctx) {
    if (renderCache.shadowsEnabled) {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        renderCache.lastPlayerShadow = null;
        renderCache.lastCrabShadow = null;
    }
}

/**
 * Get render cache (for debugging)
 */
export function getRenderCache() {
    return renderCache;
}

/**
 * Reset render cache
 */
export function resetRenderCache() {
    renderCache.lastPlayerShadow = null;
    renderCache.lastCrabShadow = null;
}

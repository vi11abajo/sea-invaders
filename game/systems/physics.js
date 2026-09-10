//SEA INVADERS - PHYSICS SYSTEM
//Collision detection and physics calculations

/**
 * Fast AABB collision check (optimized)
 */
export function fastCollisionCheck(rect1, rect2) {
    return !(rect1.x >= rect2.x + rect2.width ||
             rect2.x >= rect1.x + rect1.width ||
             rect1.y >= rect2.y + rect2.height ||
             rect2.y >= rect1.y + rect1.height);
}

/**
 * Broad phase collision check using distance
 */
export function broadPhaseCollisionCheck(bullet, invader, threshold = 100) {
    const dx = (bullet.x + bullet.width/2) - (invader.x + invader.width/2);
    const dy = (bullet.y + bullet.height/2) - (invader.y + invader.height/2);
    return (dx * dx + dy * dy) < threshold * threshold;
}

/**
 * Check collision between player and object
 */
export function checkPlayerCollision(player, object) {
    return object.x < player.x + player.width &&
           object.x + object.width > player.x &&
           object.y < player.y + player.height &&
           object.y + object.height > player.y;
}

/**
 * Check if object is out of bounds
 */
export function isOutOfBounds(object, canvasWidth, canvasHeight) {
    return object.x < -object.width ||
           object.x > canvasWidth ||
           object.y < -object.height ||
           object.y > canvasHeight;
}

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

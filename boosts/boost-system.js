//BOOST SYSTEM
//withbutinbut file with within-boostin
console.log(' boost-system.js v202510301445 loading...');

//to inwith toNOT with within
function initializeBoostSystem() {
    //Checking, inwith toNOT
    if (!window.BOOST_CONSTANTS) {
        console.error('BOOST_CONSTANTS not loaded');
        return false;
    }

    if (!window.boostManager) {
        console.error('BoostManager not loaded');
        return false;
    }

    if (!window.boostEffects) {
        console.error('BoostEffects not loaded');
        return false;
    }

    if (!window.boostIntegration) {
        console.error('BoostIntegration not loaded');
        return false;
    }

    //Initializing integration
    window.boostIntegration.initialize();

    return true;
}

//withbutin function for from with withand from game

//Creating withbut with (ininwith at andandand to)
function tryCreateBoost(x, y) {
    const roll = Math.random();
    const dropChance = BOOST_CONSTANTS.SPAWN.DROP_CHANCE;

    if (roll < dropChance && window.boostManager) {
        const boost = window.boostManager.createDroppingBoost(x, y);
        //console.log(' Boost created:', boost.type);
        return boost;
    }

    return null;
}

//atandbut Creating with but and
function createSpecificBoost(x, y, boostType) {
    if (window.boostManager) {
        return window.boostManager.createDroppingBoost(x, y, boostType);
    }
    return null;
}

//Check toandinbutwithand with
function isBoostActive(boostType) {
    return window.boostManager ? window.boostManager.isBoostActive(boostType) : false;
}

//Getting yes toandinbut with
function getActiveBoost(boostType) {
    return window.boostManager ? window.boostManager.getActiveBoost(boostType) : null;
}

//toandinand with
function deactivateBoost(boostType) {
    if (window.boostManager) {
        window.boostManager.deactivateBoost(boostType);
    }
}

//Getting toandwithin withtoin Speed Tamer
function getSpeedTamerStacks() {
    return window.boostManager ? window.boostManager.speedTamerStacks : 0;
}

//Clearing inwith within
function clearAllBoosts() {
    if (window.boostManager) {
        window.boostManager.activeBoosts.clear();
        window.boostManager.droppingBoosts = [];
        window.boostManager.speedTamerStacks = 0;
    }
    
    if (window.boostEffects) {
        window.boostEffects.clear();
    }
}

//function for integration with andinand withthemeand

//andandtoand withtowithand with (for Rapid Fire)
function getModifiedShotCooldown(baseCooldown) {
    if (isBoostActive('RAPID_FIRE')) {
        return baseCooldown / BOOST_CONSTANTS.EFFECTS.RAPID_FIRE.multiplier;
    }
    return baseCooldown;
}

//andandtoand in bullets (for and effects)
function getModifiedBulletColor(defaultColor) {
    if (isBoostActive('RAPID_FIRE')) {
        return '#ffff00'; //for Rapid Fire
    } else if (isBoostActive('MULTI_SHOT')) {
        return '#ff4444'; //towith for Multi-Shot
    } else if (isBoostActive('PIERCING_BULLETS')) {
        return '#ffffff'; //for Piercing
    }
    return defaultColor;
}

//Check andinand bullets (for Piercing Bullets)
function shouldBulletPierce() {
    return isBoostActive('PIERCING_BULLETS');
}

//andandtoand butand toin (for Score Multiplier)
function getScoreMultiplier() {
    if (isBoostActive('SCORE_MULTIPLIER')) {
        return BOOST_CONSTANTS.EFFECTS.SCORE_MULTIPLIER.multiplier;
    }
    return 1;
}

//Check toand decay (for Points Freeze)
function isPointsDecayFrozen() {
    return isBoostActive('POINTS_FREEZE');
}

//andandtoand withtowithand enemyin (for Ice Freeze and Speed Tamer)
function getEnemySpeedMultiplier() {
    let multiplier = 1;
    
    //Ice Freeze
    if (isBoostActive('ICE_FREEZE')) {
        multiplier *= BOOST_CONSTANTS.EFFECTS.ICE_FREEZE.slowdown;
    }
    
    //Speed Tamer
    const stacks = getSpeedTamerStacks();
    if (stacks > 0) {
        const reduction = stacks * BOOST_CONSTANTS.EFFECTS.SPEED_TAMER.reduction;
        multiplier *= (1 - reduction);
    }
    
    return Math.max(0.1, multiplier); //andand 10% from andandonbut withtowithand
}

//Check NOTinandwithand (for Invincibility)
function isPlayerInvincible() {
    return isBoostActive('INVINCIBILITY');
}

//Check onandand and (for Shield Barrier)
function hasActiveShield() {
    return isBoostActive('SHIELD_BARRIER');
}

//fromto damage and
function processShieldDamage() {
    const shield = getActiveBoost('SHIELD_BARRIER');
    if (!shield) return false;
    
    const hitsBlocked = shield.hitsBlocked || 0;
    shield.hitsBlocked = hitsBlocked + 1;
    
    if (shield.hitsBlocked >= BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits) {
        deactivateBoost('SHIELD_BARRIER');
    }
    
    return true; //damage toandin
}

//function for creation effects

//Creating effect and
function createHealEffect(x, y) {
    if (window.boostEffects) {
        window.boostEffects.createHealthBoostEffect(x, y);
    }
}

//Creating effect NOT
function createCoinEffect(points) {
    if (window.boostEffects) {
        window.boostEffects.createCoinShowerEffect(points);
    }
}

//Creating inbutin effect
function createWaveEffect() {
    if (window.boostEffects) {
        window.boostEffects.createWaveBlastEffect();
    }
}

//function for fromtoand and withandinand

//toandinand inwith within (for withandinand)
function activateAllBoosts() {
    const allBoosts = [];
    for (const boosts of Object.values(BOOST_CONSTANTS.RARITY.DISTRIBUTION)) {
        allBoosts.push(...boosts);
    }
    
    for (const boostType of allBoosts) {
        if (window.boostManager) {
            window.boostManager.activateBoost(boostType);
        }
    }
}

//Getting withandtoand within
function getBoostStats() {
    const stats = {
        activeBoosts: window.boostManager ? window.boostManager.activeBoosts.size : 0,
        droppingBoosts: window.boostManager ? window.boostManager.droppingBoosts.length : 0,
        speedTamerStacks: getSpeedTamerStacks(),
        particles: window.boostEffects ? window.boostEffects.particles.length : 0,
        effects: window.boostEffects ? window.boostEffects.effects.length : 0
    };
    
    return stats;
}

//inin fromtobut andformandand
function debugBoosts() {
    const stats = getBoostStats();
    return stats; //inin withandto andinand
}

//or for settings

//fromNOTand chance inand within
function setBoostDropChance(chance) {
    BOOST_CONSTANTS.SPAWN.DROP_CHANCE = Math.max(0, Math.min(1, chance));
}

//fromNOTand inand lives yesand within
function setBoostLifetime(milliseconds) {
    BOOST_CONSTANTS.SPAWN.LIFETIME = Math.max(1000, milliseconds);
}

//fromNOTand chancein towithand
function setRarityChances(common, rare, epic, legendary) {
    const total = common + rare + epic + legendary;
    if (total !== 100) {
        return false;
    }
    
    BOOST_CONSTANTS.RARITY.CHANCES.COMMON = common;
    BOOST_CONSTANTS.RARITY.CHANCES.RARE = rare;
    BOOST_CONSTANTS.RARITY.CHANCES.EPIC = epic;
    BOOST_CONSTANTS.RARITY.CHANCES.LEGENDARY = legendary;
    
    return true;
}

//andand enemy with in Creating boost
function destroyInvader(invader, invaderIndex, gameEngineParam) {
    //Getting andin inandto - prefer passed parameter over global
    const gameEngine = gameEngineParam || window.gameEngine || window.game;

    if (!gameEngine) {
        console.error(' Game engine not found in destroyInvader');
        console.error(' - gameEngineParam:', !!gameEngineParam);
        console.error(' - window.gameEngine:', !!window.gameEngine);
        console.error(' - window.game:', !!window.game);
        return;
    }

    //Adding points - getInvaderScore for inandbut score
    let points;
    if (gameEngine.getInvaderScore && invader.row !== undefined) {
        //method inandto for score toin with yes, in and decay
        points = gameEngine.getInvaderScore(invader.row);
    } else {
        //Fallback on with with
        points = invader.points || 10;
    }

    //Safety check for NaN
    if (isNaN(points) || points === undefined || points === null) {
        console.error('❌ [destroyInvader] Invalid points:', points, 'for invader row:', invader.row);
        points = 10; // Safe fallback
    }

    //at SCORE_MULTIPLIER boost
    const multiplier = getScoreMultiplier();
    points = Math.floor(points * multiplier);

    //Safety check for score
    if (isNaN(gameEngine.score)) {
        console.error('❌ [destroyInvader] Score was NaN, resetting to 0');
        gameEngine.score = 0;
    }

    gameEngine.score += points;

    if (window.score !== undefined) {
        window.score = gameEngine.score;
    }

    //inandandin scoreandto and enemyin
    if (gameEngine.enemiesKilled !== undefined) {
        gameEngine.enemiesKilled++;
    }

    //Updating UI with
    if (gameEngine.updateScore) {
        gameEngine.updateScore();
    }

    //CRITICAL: explicitly update the counter DOM elements
    if (gameEngine.updateDOMUI) {
        gameEngine.updateDOMUI();
    } else {
        // Fallback - update the DOM directly
        const scoreEl = document.getElementById('score');
        const mobileScoreEl = document.getElementById('mobileScore');
        if (scoreEl) scoreEl.textContent = gameEngine.score;
        if (mobileScoreEl) mobileScoreEl.textContent = gameEngine.score;
    }

    //into Easter Egg Manager fromNOTandand score
    if (window.easterEggManager) {
        if (window.easterEggManager.onScoreUpdate) {
            window.easterEggManager.onScoreUpdate(gameEngine.score);
        }
        //into andwithin enemy (for 77% and)
        if (window.easterEggManager.onMobKilled) {
            window.easterEggManager.onMobKilled();
        }
    } else {
        console.warn(' boost-system.js - easterEggManager not available!');
    }

    //withyes inin
    if (gameEngine.createExplosion) {
        gameEngine.createExplosion(invader.x, invader.y, invader.color || '#00ff00');
    }

    //infromfromand SCORE_MULTIPLIER
    if (multiplier > 1 && window.boostEffects && window.boostEffects.createFloatingText) {
        const centerX = invader.x + invader.width / 2;
        const centerY = invader.y + invader.height / 2;
        const basePoints = Math.floor(points / multiplier);
        window.boostEffects.createFloatingText(
            centerX,
            centerY,
            `${basePoints}x${multiplier}`,
            '#ffd700',
            3.0
        );
    }

    //sound inin
    if (window.soundManager) {
        window.soundManager.playSound('crabDeath', 0.3);
    }

    //with Create boost (Checking alive or !destroyed)
    if (invader.alive || !invader.destroyed) {
        tryCreateBoost(invader.x + invader.width / 2, invader.y);
    }

    //enemy as in
    invader.alive = false;
    invader.destroyed = true;
}

//towithand inwith function in with
window.initializeBoostSystem = initializeBoostSystem;
window.destroyInvader = destroyInvader;
window.tryCreateBoost = tryCreateBoost;
window.createSpecificBoost = createSpecificBoost;
window.isBoostActive = isBoostActive;
window.getActiveBoost = getActiveBoost;
window.deactivateBoost = deactivateBoost;
window.getSpeedTamerStacks = getSpeedTamerStacks;
window.clearAllBoosts = clearAllBoosts;

window.getModifiedShotCooldown = getModifiedShotCooldown;
window.getModifiedBulletColor = getModifiedBulletColor;
window.shouldBulletPierce = shouldBulletPierce;
window.getScoreMultiplier = getScoreMultiplier;
window.isPointsDecayFrozen = isPointsDecayFrozen;
window.getEnemySpeedMultiplier = getEnemySpeedMultiplier;
window.isPlayerInvincible = isPlayerInvincible;
window.hasActiveShield = hasActiveShield;
window.processShieldDamage = processShieldDamage;

window.createHealEffect = createHealEffect;
window.createCoinEffect = createCoinEffect;
window.createWaveEffect = createWaveEffect;

window.activateAllBoosts = activateAllBoosts;
window.getBoostStats = getBoostStats;
window.debugBoosts = debugBoosts;
window.setBoostDropChance = setBoostDropChance;
window.setBoostLifetime = setBoostLifetime;
window.setRarityChances = setRarityChances;

//Initializing with at to
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (!initializeBoostSystem()) {
            console.error(' Failed to initialize Boost System');
        }
    }, 2000);
});

//Boost System loaded silently
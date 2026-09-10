//BOOST INTEGRATION
//Integration of boost system with main game
console.log(' boost-integration.js v20251029999 loading...');

class BoostIntegration {
    constructor() {
        this.initialized = false;
    }

    //Initialization integration
    initialize() {
        if (this.initialized) {
            console.log(' BoostIntegration already initialized, skipping');
            return;
        }

        console.log(' Initializing BoostIntegration...');

        try {
            //Patching to for regular game (NOT for tournamentbut mode)
            //tournament mode uses direct integration in tournamentGame
            this.patchGameFunctions();
            //this.patchPlayerFunctions(); // DISABLED for tournament
            //this.patchBulletFunctions(); // DISABLED for tournament
            this.patchEnemyFunctions();
            this.patchUIFunctions();

            this.initialized = true;
            console.log(' BoostIntegration initialized!');
        } catch (error) {
            console.error(' Error initializing BoostIntegration:', error);
        }
    }

    //listener tournamentbut mode (DISABLED)
    setupTournamentModeListener() {
        //DISABLED: tournament mode uses direct integration in tournamentGame
        //Patching no longer required
        return;
    }

    //TournamentGame patching (DISABLED)
    patchTournamentGame(gameInstance) {
        //DISABLED: tournament mode uses direct integration in tournamentGame
        //Patching no longer required
        console.log('ℹ TournamentGame patching skipped - using direct integration');
        return;
    }

    //listener start game for delayed patching (DISABLED)
    setupGameStartListener() {
        //tournament mode uses direct integration in tournamentGame
        //Patching no longer required
        return;
    }

    //and andin toand
    patchGameFunctions() {
        //function butinand game
        const originalGameUpdate = window.updateGame;
        if (originalGameUpdate) {
            window.updateGame = (deltaTime) => {
                originalGameUpdate(deltaTime);
                
                //Updating with within
                if (window.boostManager) {
                    window.boostManager.update(deltaTime);
                }
                if (window.boostEffects) {
                    window.boostEffects.update(deltaTime);
                }
            };
        }

        //function fromintoand game
        const originalGameRender = window.renderGame;
        if (originalGameRender) {
            window.renderGame = (ctx) => {
                originalGameRender(ctx);
                
                //frominin with
                if (window.boostManager) {
                    window.boostManager.render(ctx);
                }
                if (window.boostEffects) {
                    window.boostEffects.render(ctx);
                }
            };
        }

        //intoand incanwithand on next level
        const originalCanStartNextLevel = window.canStartNextLevel;
        window.canStartNextLevel = () => {
            const originalResult = originalCanStartNextLevel ? originalCanStartNextLevel() : true;
            const boostResult = window.boostManager ? window.boostManager.canStartNextLevel() : true;
            return originalResult && boostResult;
        };

        //on butin in
        const originalStartNewLevel = window.startNewLevel;
        if (originalStartNewLevel) {
            window.startNewLevel = () => {
                if (window.boostManager) {
                    window.boostManager.clearForNewLevel();
                }
                originalStartNewLevel();
            };
        }
    }

    //and toand player
    patchPlayerFunctions() {
        console.log(' Patching player functions...');
        console.log('   window.updatePlayer:', !!window.updatePlayer);
        console.log('   window.createBullet:', !!window.createBullet);

        //function butinand player for with
        //Saving andandon toyes for inwithwithbutinand
        let originalBaseShotCooldown = null;
        let rapidFireActive = false;

        const originalUpdatePlayer = window.updatePlayer;
        if (originalUpdatePlayer && !originalUpdatePlayer.__boostPatched) {
            console.log(' Patching updatePlayer for RAPID_FIRE');
            window.updatePlayer = function(deltaTime) {
                //Checking status Rapid Fire
                const isRapidFireActive = window.boostManager && window.boostManager.isBoostActive('RAPID_FIRE');
                
                //at effect to at toandinandand
                if (isRapidFireActive && !rapidFireActive) {
                    originalBaseShotCooldown = window.shotCooldown;
                    const rapidFireMultiplier = BOOST_CONSTANTS.EFFECTS.RAPID_FIRE.multiplier;
                    window.shotCooldown = originalBaseShotCooldown / rapidFireMultiplier;
                    rapidFireActive = true;
                    //Rapid Fire activated! Cooldown reduced
                }
                
                //inwithwithoninandin toyes at toandinandand
                if (!isRapidFireActive && rapidFireActive) {
                    if (originalBaseShotCooldown !== null) {
                        window.shotCooldown = originalBaseShotCooldown;
                        //Rapid Fire deactivated! Cooldown restored
                    }
                    rapidFireActive = false;
                }
                
                //inin andandon toand
                const result = originalUpdatePlayer.apply(this, arguments);
                return result;
            };
            window.updatePlayer.__boostPatched = true;
            console.log(' updatePlayer patched for RAPID_FIRE');
        } else if (originalUpdatePlayer && originalUpdatePlayer.__boostPatched) {
            console.log(' updatePlayer already patched, skipping');
        }

        //function createBullet for Multi-Shot
        if (typeof window.createBullet === 'function' && !window.createBullet.__boostPatched) {
            console.log(' Patching createBullet for MULTI_SHOT');
            const originalCreateBullet = window.createBullet;
            
            window.createBullet = function() {
                const now = Date.now();
                const currentCooldown = window.shotCooldown !== undefined ? window.shotCooldown : 150;
                
                const lastShot = typeof window.lastShotTime === 'function' ? window.lastShotTime() : (window.lastShotTime || 0);
                if (now - lastShot > currentCooldown) {
                    if (window.boostManager && window.boostManager.isBoostActive('MULTI_SHOT') && window.boostEffects) {
                        //Multi-Shot toandin - Creating 3 bullets
                        const playerCenterX = window.player.x + window.player.width / 2;
                        const playerY = window.player.y;
                        
                        const bulletTemplates = window.boostEffects.getMultiShotBullets(playerCenterX, playerY);
                        
                        for (const template of bulletTemplates) {
                            const bullet = {
                                x: template.x - 3,
                                y: template.y,
                                width: 6,
                                height: 15,
                                speed: 8,
                                trail: [],
                                vy: template.vy,
                                vx: template.vx,
                                color: template.color,
                                //Setting inand and within
                                multiShot: true,  //as bullet andfrom
                                piercing: window.boostManager && window.boostManager.isBoostActive('PIERCING_BULLETS'),
                                //yeswith autoTarget into for andfrom
                                autoTarget: false,
                                originalVx: undefined,
                                originalVy: undefined
                            };
                            
                            if (window.bullets) {
                                window.bullets.push(bullet);
                            }
                        }

                        //sound inwith andfrom
                        if (window.soundManager) {
                            window.soundManager.playSound('multiShot', 0.6, 1.0 + Math.random() * 0.2);
                        }

                        //Multi-Shot: Created 3 bullets
                        if (typeof window.setLastShotTime === 'function') {
                            window.setLastShotTime(now);
                        } else {
                            window.lastShotTime = now;
                        }
                        
                        if (window.createRipple) {
                            window.createRipple(playerCenterX, playerY);
                        }
                    } else {
                        //regular inwith
                        return originalCreateBullet.apply(this, arguments);
                    }
                }
            };
            window.createBullet.__boostPatched = true;
            console.log(' createBullet patched for MULTI_SHOT');
        } else if (typeof window.createBullet === 'function' && window.createBullet.__boostPatched) {
            console.log(' createBullet already patched, skipping');
        }

        //and damage player - and inand toand
        let damageFunctionPatched = false;
        
        //onand toand damage oninand
        const possibleDamageFunctions = ['damagePlayer', 'playerTakeDamage', 'hitPlayer', 'playerHit'];
        
        for (const funcName of possibleDamageFunctions) {
            if (window[funcName] && typeof window[funcName] === 'function') {
                const originalDamageFunction = window[funcName];
                window[funcName] = function(damage = 1) {
                    //Checking damage protection
                    
                    //Checking Invincibility
                    if (window.boostManager && window.boostManager.isBoostActive('INVINCIBILITY')) {
                        //Invincibility blocked damage!
                        return false; //player NOTinand
                    }

                    //Checking Shield Barrier
                    if (window.boostManager && window.boostManager.isBoostActive('SHIELD_BARRIER')) {
                        const boost = window.boostManager.getActiveBoost('SHIELD_BARRIER');
                        const hitsBlocked = boost.hitsBlocked || 0;
                        
                        if (hitsBlocked < BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits) {
                            boost.hitsBlocked = hitsBlocked + 1;
                            //Shield blocked hit
                            
                            //if and , toandinand
                            if (boost.hitsBlocked >= BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits) {
                                window.boostManager.deactivateBoost('SHIELD_BARRIER');
                                //Shield depleted!
                            }
                            
                            return false; //damage toandin
                        }
                    }

                    //at regular damage
                    return originalDamageFunction.apply(this, arguments);
                };
                //Damage function patched for damage protection
                damageFunctionPatched = true;
                break;
            }
        }
        
        if (!damageFunctionPatched) {
            //No damage function found to patch
        }
    }

    //and toand bullets
    patchBulletFunctions() {
        //butinand bullets
        const originalUpdateBullets = window.updateBullets;
        if (originalUpdateBullets) {
            window.updateBullets = function(deltaTime) {
                //inbut: at effect to butinand andand bullets
                
                //Auto-Target for bullets player atNOT in
                //effect for bullets toin (RICOCHET, GRAVITY_WELL) atwith in withbutinbut andto game.js
                
                //at Auto-Target effect to bullets player
                if (window.boostEffects && window.bullets) {
                    const enemies = [...(window.invaders || [])];
                    if (window.bossSystem && window.bossSystem.currentBoss) {
                        enemies.push(window.bossSystem.currentBoss);
                    }

                    for (const bullet of window.bullets) {
                        window.boostEffects.applyAutoTargetEffect(bullet, enemies);
                    }
                }

                //after atNOTand effects inin andandon toand butinand bullets
                originalUpdateBullets.call(this, deltaTime);
            };
            //updateBullets patched for Auto-Target effect
        } else {
            //updateBullets function not found
        }

        //butinand bullets toin (if withwithin)
        const originalUpdateCrabBullets = window.updateCrabBullets;
        if (originalUpdateCrabBullets) {
            window.updateCrabBullets = () => {
                originalUpdateCrabBullets();
            };
        }
    }

    //and toand enemyin
    patchEnemyFunctions() {
        //Patching enemy functions...

        //Patching destroyInvader - function on in boost-system.js
        //and on with in Creating boostin, toand, soundand and effectand

        //moveInvaders for Ice Freeze effect - on andtoand inandand
        if (window.moveInvaders && typeof window.moveInvaders === 'function') {
            const originalMoveInvaders = window.moveInvaders;
            //cacheand into toandinbutwithand with
            let lastIceCheck = 0;
            let isIceFrozen = false;
            const CHECK_INTERVAL = 100; //Checking toandinbutwith in 100with inwith toto to
            
            window.moveInvaders = function() {
                //andfromand: Checking toandinbutwith Ice Freeze
                const now = performance.now();
                if (now - lastIceCheck > CHECK_INTERVAL) {
                    isIceFrozen = window.boostManager && window.boostManager.isBoostActive('ICE_FREEZE');
                    lastIceCheck = now;
                }
                
                //at Ice Freeze and
                if (isIceFrozen) {
                    const slowdown = BOOST_CONSTANTS.EFFECTS.ICE_FREEZE.slowdown;
                    
                    //Checking towithbutwith
                    if (!window.invaders || !Array.isArray(window.invaders)) {
                        return originalMoveInvaders.call(this);
                    }
                    
                    const invaderSpeed = window.invaderSpeed || 1;
                    const deltaTime = window.deltaTime || 1;
                    const invaderDirection = window.invaderDirection || 1;
                    
                    //toand andto from andandonbut function, but with and
                    for (let invader of window.invaders) {
                        if (invader.alive) {
                            //at Ice Freeze and ondirect to withtowithand
                            const currentSpeed = invaderSpeed * deltaTime * slowdown;
                            
                            //Checking inandbutwith fromNOTand
                            if (isFinite(currentSpeed) && isFinite(invaderDirection) && isFinite(invader.x)) {
                                invader.x += currentSpeed * invaderDirection;
                                invader.animFrame += 0.08 * deltaTime * slowdown;
                                invader.clawOffset += 0.12 * deltaTime * slowdown;
                            }
                        }
                    }
                } else {
                    //regular inin and
                    return originalMoveInvaders.call(this);
                }
            };
            //moveInvaders patched for Ice Freeze effect
        } else {
            //moveInvaders function not found
        }
        
    }

    //and UI toand
    patchUIFunctions() {
        //fromintoand player
        const originalRenderPlayer = window.renderPlayer;
        window.renderPlayer = (ctx) => {
            if (originalRenderPlayer) originalRenderPlayer(ctx);

            if (!window.player || !window.boostEffects) return;

            //frominin effect within on player
            window.boostEffects.renderShieldEffect(ctx, window.player);
            window.boostEffects.renderInvincibilityEffect(ctx, window.player);
        };

        //fromintoand enemyin for toinand effects yes
        const originalDrawInvaders = window.drawInvaders;
        if (originalDrawInvaders) {
            window.drawInvaders = function() {
                //withon enemyin
                const result = originalDrawInvaders.apply(this, arguments);
                
                //cacheand into toandinbutwithand Ice Freeze for inwith enemyin with
                const isIceFreezeActive = window.boostManager && 
                    window.boostManager.isBoostActive('ICE_FREEZE') && 
                    window.invaders && window.ctx;
                    
                if (isIceFreezeActive) {
                    //andfromand: effect for inwith andin enemyin and
                    for (let i = 0, len = window.invaders.length; i < len; i++) {
                        const invader = window.invaders[i];
                        if (invader.alive) {
                            window.boostIntegration.drawIceCubeEffect(window.ctx, invader);
                        }
                    }
                }
                
                return result;
            };
            //drawInvaders patched for ice effects
        }

        //fromintoand background
        const originalRenderBackground = window.renderBackground;
        window.renderBackground = (ctx) => {
            if (originalRenderBackground) originalRenderBackground(ctx);

            if (!window.boostEffects) return;

            //frominin backgroundin effect
            window.boostEffects.renderPointsFreezeEffect(ctx);
            window.boostEffects.renderIceFreezeEffect(ctx);
            window.boostEffects.renderGravityWellEffect(ctx);
        };

        //and function with toin for Points Freeze
        const possibleScoreFunctions = ['updateScoreMultiplier', 'updateScore', 'scoreUpdate', 'updateScoring'];
        let scoreFunctionPatched = false;
        
        for (const funcName of possibleScoreFunctions) {
            if (window[funcName] && typeof window[funcName] === 'function') {
                const originalScoreFunction = window[funcName];
                window[funcName] = function() {
                    //if toandin Points Freeze, NOT Updating with toin
                    if (window.boostManager && window.boostManager.isBoostActive('POINTS_FREEZE')) {
                        //Points Freeze active: score system update blocked
                        return;
                    }
                    
                    return originalScoreFunction.apply(this, arguments);
                };
                //Score function patched for Points Freeze effect
                scoreFunctionPatched = true;
                break;
            }
        }
        
        if (!scoreFunctionPatched) {
            //No score update function found to patch
        }
    }

    //Check withtobutinand bullets with to (with Piercing)
    checkBulletInvaderCollision(bullet, invader) {
        const hit = bullet.x < invader.x + invader.width &&
                   bullet.x + bullet.width > invader.x &&
                   bullet.y < invader.y + invader.height &&
                   bullet.y + bullet.height > invader.y;

        if (hit && !bullet.piercing) {
            //on bullet andwith at yesandand
            return 'destroy_bullet';
        } else if (hit && bullet.piercing) {
            //andin bullet to
            return 'piercing_hit';
        }

        return 'no_hit';
    }

    //inand withandNOT bulletswithand into but enemy
    drawIceCubeEffect(ctx, invader) {
        //with Check inandbutwithand yes enemy
        if (!invader || !isFinite(invader.x) || !isFinite(invader.y)) {
            return;
        }
        
        const centerX = invader.x + invader.width / 2;
        const centerY = invader.y + invader.height / 2;
        
        //with Check
        if (!isFinite(centerX) || !isFinite(centerY)) {
            return;
        }
        
        //andfromand: FAST in
        const time = performance.now() * 0.002;
        
        //Saving totowith
        ctx.save();
        
        //Pulsing effect
        const radius = 28 + Math.sin(time * 3) * 3; //inand
        const alpha = 0.25 + Math.sin(time * 4) * 0.05; //andwithandinbutwith
        
        //Creating and for
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, `rgba(170, 238, 255, ${alpha})`);      //-
        gradient.addColorStop(0.7, `rgba(100, 200, 255, ${alpha * 0.6})`); //withandon - withandand
        gradient.addColorStop(1, `rgba(50, 150, 255, 0)`);              //to -
        
        //Draw withbutin
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        //toandbut inNOT to for amplification effect
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = '#aaeeff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        
        //toand and points into
        ctx.globalAlpha = Math.sin(time * 6) * 0.5 + 0.5;
        ctx.fillStyle = '#ffffff';
        
        for (let i = 0; i < 6; i++) {
            const angle = (time + i * Math.PI / 3) % (Math.PI * 2);
            const sparkleX = centerX + Math.cos(angle) * (radius * 0.8);
            const sparkleY = centerY + Math.sin(angle) * (radius * 0.8);
            
            ctx.beginPath();
            ctx.arc(sparkleX, sparkleY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        //inwithwithoninandin totowith
        ctx.restore();
    }

    //Creating effect with
    createBoostPickupEffect(boost) {
        if (!window.boostEffects) return;

        const info = BOOST_CONSTANTS.INFO[boost.type];
        
        //Creating effect
        window.boostEffects.createFloatingText(
            boost.x + boost.width / 2,
            boost.y,
            `${info.icon} ${info.name}`,
            BOOST_CONSTANTS.RARITY.COLORS[boost.rarity],
            2000
        );

        //Creating particle
        for (let i = 0; i < 8; i++) {
            window.boostEffects.createParticle({
                x: boost.x + boost.width / 2,
                y: boost.y + boost.height / 2,
                color: BOOST_CONSTANTS.RARITY.COLORS[boost.rarity],
                size: 2 + Math.random() * 3,
                life: 1.5,  //1.5 seconds (was 1500 with)
                vx: (Math.random() - 0.5) * 480,  //px/s (was 8 px/frame → 480 px/s at 60 FPS)
                vy: (Math.random() - 0.5) * 480  //px/s (was 8 px/frame → 480 px/s at 60 FPS)
            });
        }

        //withand effect for within
        if (boost.type === 'HEALTH_BOOST' && window.player) {
            window.boostEffects.createHealthBoostEffect(window.player.x, window.player.y);
        } else if (boost.type === 'COIN_SHOWER') {
            const bonusPoints = Math.floor(window.score * BOOST_CONSTANTS.EFFECTS.COIN_SHOWER.percentage);
            window.boostEffects.createCoinShowerEffect(bonusPoints);
        } else if (boost.type === 'WAVE_BLAST') {
            window.boostEffects.createWaveBlastEffect();
        }
    }

    //andbutwithandto
    checkPatches() {
        //Checking function patches status...
        
        const functions = [
            'handleInput', 'updateGame', 'createPlayerBullet',
            'damagePlayer', 'playerTakeDamage', 'hitPlayer', 'playerHit',
            'destroyInvader', 'killInvader', 'removeInvader', 'destroyEnemy',
            'moveInvaders', 'updateInvaders', 'moveEnemies', 'updateEnemies',
            'renderPlayer', 'renderBackground',
            'updateScoreMultiplier', 'updateScore', 'scoreUpdate', 'updateScoring',
            'updatePlayerBullets', 'updateCrabBullets'
        ];
        
        const patchedFunctions = [];
        const missingFunctions = [];
        
        for (const funcName of functions) {
            if (window[funcName] && typeof window[funcName] === 'function') {
                patchedFunctions.push(funcName);
            } else {
                missingFunctions.push(funcName);
            }
        }
        
        //Patched functions recorded
        //Missing functions recorded
        
        //Check key variables
        const variables = ['player', 'score', 'playerHealth', 'shotCooldown', 'invaderSpeed'];
        //Available variables checked
        for (const varName of variables) {
            const available = window[varName] !== undefined;
            //Variable availability checked
        }
        
        return {
            patchedFunctions,
            missingFunctions,
            totalPatches: patchedFunctions.length
        };
    }

    //withwith integration
    reset() {
        this.initialized = false;
    }
}

//Creating global instance
window.boostIntegration = new BoostIntegration();

//Initialization and to boost-system.js
//and inwith inandwithand (BOOST_CONSTANTS, boostManager, boostEffects)
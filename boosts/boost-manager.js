//BOOST MANAGER
//withbutinbut NOT with within-boostin

class BoostManager {
    constructor() {
        this.activeBoosts = new Map(); //toandin with
        this.droppingBoosts = [];      //yesand withghj
        this.speedTamerStacks = 0;     //toandwithin with Speed Tamer
        this.nextBoostId = 1;          //ID for within
        this.imageCache = new Map();   //cache fromand within
        
        //atinin totowith
        this.update = this.update.bind(this);
        this.render = this.render.bind(this);

        //Initializing withand boostin on withbutin
        this.initializeBoostDistribution();

        //Loading fromand within
        this.loadBoostImages();

        //Initializing fromand toyes Theme Manager fromin
        window.addEventListener('themeManagerReady', () => {
            this.imageCache.clear();
            this.initializeBoostDistribution(); //Updating withand boostin
            this.loadBoostImages();
        });

        //Initializing fromand at withNOT
        window.addEventListener('themeChanged', () => {
            this.imageCache.clear();
            this.initializeBoostDistribution(); //Updating withand boostin
            this.loadBoostImages();
        });
    }

    //Initialization withand boostin on withbutin to
    initializeBoostDistribution() {
        //withwithin COMMON to in withto
        BOOST_CONSTANTS.RARITY.DISTRIBUTION.COMMON = ['RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE'];

        //Checking to
        const currentTheme = window.themeManager?.getCurrentTheme() || 'default';

        //if theme Halloween, Adding Halloween boost
        if (currentTheme === 'halloween') {
            BOOST_CONSTANTS.RARITY.DISTRIBUTION.COMMON.push(...BOOST_CONSTANTS.RARITY.HALLOWEEN_BOOSTS);
        }
    }

    //inand path to fromand (within function, withinon for withinwithandwithand)
    detectImagesPath() {
        const currentPath = window.location.pathname;
        if (currentPath.includes('/tournament/') || currentPath.includes('\\tournament\\') ||
            currentPath.includes('/coraluna/') || currentPath.includes('\\coraluna\\') ||
            currentPath.includes('/xmas/') || currentPath.includes('\\xmas\\')) {
            return '../themes/default/images';
        }
        return 'themes/default/images';
    }

    //Loading fromand within Theme Manager
    loadBoostImages() {
        const boostTypeMap = {
            'RAPID_FIRE': 'rapidFire',
            'SHIELD_BARRIER': 'shieldBarrier',
            'SCORE_MULTIPLIER': 'scoreMultiplier',
            'POINTS_FREEZE': 'pointsFreeze',
            'MULTI_SHOT': 'multiShot',
            'HEALTH_BOOST': 'healthBoost',
            'PIERCING_BULLETS': 'piercingBullets',
            'INVINCIBILITY': 'invincibility',
            'GRAVITY_WELL': 'gravityWell',
            'RICOCHET': 'ricochet',
            'RANDOM_CHAOS': 'randomChaos',
            'ICE_FREEZE': 'iceFreeze',
            'AUTO_TARGET': 'autoTarget',
            'COIN_SHOWER': 'coinShower',
            'WAVE_BLAST': 'waveBlast',
            'SPEED_TAMER': 'speedTamer',
            'SCREAM': 'scream',
            'KNIFE': 'knifeBoost'
        };

        //withand withto boostin tofrom but for to
        const activeBoostTypes = new Set();
        Object.values(BOOST_CONSTANTS.RARITY.DISTRIBUTION).forEach(boostArray => {
            boostArray.forEach(boostType => activeBoostTypes.add(boostType));
        });

        //and to toandin boost
        const activeBoostTypeMap = {};
        for (const [boostType, imageName] of Object.entries(boostTypeMap)) {
            if (activeBoostTypes.has(boostType)) {
                activeBoostTypeMap[boostType] = imageName;
            }
        }

        //Loading fromand aftertoinbut with NOT to
        //from ERR_EMPTY_RESPONSE at butwithin request
        const entries = Object.entries(activeBoostTypeMap);
        let loadIndex = 0;

        const loadNextImage = () => {
            if (loadIndex >= entries.length) return;

            const [boostType, imageName] = entries[loadIndex];
            loadIndex++;

            const img = new Image();
            img.onload = () => {
                this.imageCache.set(boostType, img);
                //Loading with fromand 50ms
                setTimeout(loadNextImage, 50);
            };
            img.onerror = () => {
                //to to yes if from error
                setTimeout(loadNextImage, 50);
            };

            //Theme Manager if towith
            if (window.themeManager && window.themeManager.isInitialized) {
                img.src = window.themeManager.getImagePath('boosts', imageName);
            } else {
                //Fallback with to (tournament, coraluna, xmas) and withNOTbut
                const savedTheme = localStorage.getItem('selectedTheme') || 'default';
                const currentPath = window.location.pathname;
                const basePath = (currentPath.includes('/tournament/') || currentPath.includes('/coraluna/') || currentPath.includes('/xmas/'))
                    ? `../themes/${savedTheme}/images/boosts/`
                    : `themes/${savedTheme}/images/boosts/`;
                img.src = `${basePath}${imageName}.png`;
            }
        };

        //onandon to in fromand
        loadNextImage();
    }

    //NOTand withbut with with towithand
    generateRandomBoost() {
        const rand = Math.random() * 100;
        let selectedRarity;

        //towith
        if (rand <= BOOST_CONSTANTS.RARITY.CHANCES.LEGENDARY) {
            selectedRarity = 'LEGENDARY';
        } else if (rand <= BOOST_CONSTANTS.RARITY.CHANCES.LEGENDARY + BOOST_CONSTANTS.RARITY.CHANCES.EPIC) {
            selectedRarity = 'EPIC';
        } else if (rand <= BOOST_CONSTANTS.RARITY.CHANCES.LEGENDARY + BOOST_CONSTANTS.RARITY.CHANCES.EPIC + BOOST_CONSTANTS.RARITY.CHANCES.RARE) {
            selectedRarity = 'RARE';
        } else {
            selectedRarity = 'COMMON';
        }

        //inand with with from inbut towithand
        const availableBoosts = BOOST_CONSTANTS.RARITY.DISTRIBUTION[selectedRarity];

        //if array with, fromtoinwith to COMMON
        if (!availableBoosts || availableBoosts.length === 0) {
            console.error(` No boosts available for rarity ${selectedRarity}, falling back to COMMON`);
            const commonBoosts = BOOST_CONSTANTS.RARITY.DISTRIBUTION['COMMON'];
            const randomIndex = Math.floor(Math.random() * commonBoosts.length);
            return commonBoosts[randomIndex];
        }

        const randomIndex = Math.floor(Math.random() * availableBoosts.length);
        return availableBoosts[randomIndex];
    }

    //Creating yes with
    createDroppingBoost(x, y, type = null) {
        const boostType = type || this.generateRandomBoost();
        
        const boost = {
            id: this.nextBoostId++,
            type: boostType,
            x: x,
            y: y,
            width: BOOST_CONSTANTS.SPAWN.SIZE,
            height: BOOST_CONSTANTS.SPAWN.SIZE,
            speed: BOOST_CONSTANTS.SPAWN.FALL_SPEED,
            lifetime: BOOST_CONSTANTS.SPAWN.LIFETIME,
            age: 0,
            rarity: this.getBoostRarity(boostType),
            glowPhase: 0 //for andandand withinand
        };

        this.droppingBoosts.push(boost);
        return boost;
    }

    //Getting towithand with
    getBoostRarity(boostType) {
        for (const [rarity, boosts] of Object.entries(BOOST_CONSTANTS.RARITY.DISTRIBUTION)) {
            if (boosts.includes(boostType)) {
                return rarity;
            }
        }
        return 'COMMON';
    }

    //toandinand with
    activateBoost(boostType) {
        //console.log(' activateBoost called for:', boostType);

        //inwithfrominand sound amplification
        if (window.soundManager) {
            //toinand and amplification in camelCase for sound
            const boostNameForSound = boostType.toLowerCase()
                .split('_')
                .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
                .join('');
            soundManager.playBoostSound(boostNameForSound, 0.7);
        }

        //Checking with withand
        if (boostType === 'SHIELD_BARRIER' && this.isBoostActive('SHIELD_BARRIER')) {
            return false; //NOT in new and while within old
        }

        if (boostType === 'HEALTH_BOOST') {
            //defense from inbut inNOTand butinbut with
            if (!this.healthBoostProcessed) {
                this.healthBoostProcessed = true;
                this.applyHealthBoost();
                //withwithin NOT to
                setTimeout(() => { this.healthBoostProcessed = false; }, 100);
            }
            return true;
        }

        if (boostType === 'COIN_SHOWER') {
            //defense from inbut inNOTand butinbut with
            if (!this.coinShowerProcessed) {
                this.coinShowerProcessed = true;
                this.applyCoinShower();
                //withwithin NOT to
                setTimeout(() => { this.coinShowerProcessed = false; }, 100);
            }
            return true;
        }

        if (boostType === 'WAVE_BLAST') {
            //defense from inbut inNOTand butinbut with
            if (!this.waveBlastProcessed) {
                this.waveBlastProcessed = true;
                const success = this.applyWaveBlast();
                //withwithin NOT to
                setTimeout(() => { this.waveBlastProcessed = false; }, 100);

                //if Wave Blast NOT withfrom (NOT enemyin), inin false
                if (!success) {
                    console.log(' WAVE_BLAST: Cannot activate during boss level - boost not consumed');
                    return false;
                }
            }
            return true;
        }

        if (boostType === 'SPEED_TAMER') {
            this.applySpeedTamer();
            return true;
        }

        if (boostType === 'SCREAM') {
            //toandinand Easter Egg Scream
            //Checking withbutin and
            if (window.gameEngine && window.gameEngine.screamSystem) {
                window.gameEngine.screamSystem.show();
                return true;
            }
            //for tournamentbut mode with toandinand as regular boost
            //(infrom effect fromin boostEffects)
            console.log(' SCREAM activated (tournament mode)');
            const duration = BOOST_CONSTANTS.DURATIONS[boostType] || 5000;
            this.activeBoosts.set(boostType, {
                type: boostType,
                duration: duration,
                startTime: Date.now()
            });
            return true;
        }

        if (boostType === 'KNIFE') {
            //toandinand Knife Ghost attack
            //Checking withbutin and
            if (window.gameEngine && window.gameEngine.knifeGhostSystem) {
                window.gameEngine.knifeGhostSystem.show(window.gameEngine);
                return true;
            }
            //for tournamentbut mode toandinand as regular boost
            console.log(' KNIFE activated (tournament mode)');
            const duration = BOOST_CONSTANTS.DURATIONS[boostType] || 5000;
            this.activeBoosts.set(boostType, {
                type: boostType,
                duration: duration,
                startTime: Date.now()
            });
            return true;
        }

        if (boostType === 'RANDOM_CHAOS') {
            return this.applyRandomChaos();
        }

        //for within with timer
        const duration = BOOST_CONSTANTS.DURATIONS[boostType];

        if (duration > 0 || duration === -1) { //andin and withtoNOT with (-1)
            //if with toandin, withwithin timer
            const boostData = {
                type: boostType,
                duration: duration,
                startTime: Date.now(),
                //for Shield Barrier Adding scoreandto toandin yesin
                hitsBlocked: boostType === 'SHIELD_BARRIER' ? 0 : undefined
            };
            
            //for GRAVITY_WELL Creating to in withbut with on withbut withwithandand
            if (boostType === 'GRAVITY_WELL' && window.player && window.canvas &&
                !isNaN(window.canvas.width) && !isNaN(window.canvas.height)) {
                const minDistance = 100; //andandbut withwithand from player
                const margin = 50; //fromwith from toin toon
                let attempts = 0;
                let centerX, centerY;

                //and with (towithand 20 to)
                do {
                    centerX = margin + Math.random() * (window.canvas.width - 2 * margin);
                    centerY = margin + Math.random() * (window.canvas.height - 2 * margin);
                    
                    const playerCenterX = window.player.x + window.player.width / 2;
                    const playerCenterY = window.player.y + window.player.height / 2;
                    const distanceToPlayer = Math.sqrt(
                        (centerX - playerCenterX) ** 2 + (centerY - playerCenterY) ** 2
                    );
                    
                    if (distanceToPlayer >= minDistance) {
                        break;
                    }
                    attempts++;
                } while (attempts < 20);
                
                boostData.centerX = centerX;
                boostData.centerY = centerY;
                //Gravity Well activated at safe distance from player
            }
            
            this.activeBoosts.set(boostType, boostData);
            return true;
        }

        return false;
    }

    //atNOTand with toin
    applyHealthBoost() {
        const maxLives = window.MAX_LIVES || 100; //towith from game
        const healAmount = BOOST_CONSTANTS.EFFECTS.HEALTH_BOOST.heal;

        //Checking tournament mode
        if (window.gameInstance && typeof window.gameInstance.lives === 'number') {
            const oldLives = window.gameInstance.lives;
            window.gameInstance.lives = Math.min(maxLives, window.gameInstance.lives + healAmount);
            console.log(` Health Boost: ${oldLives} → ${window.gameInstance.lives} (tournament mode)`);

            // Update UI with React callbacks
            if (window.gameInstance.updateDOMUI) {
                window.gameInstance.updateDOMUI();
            }

            //Creating heal effect
            this.createHealEffect();
            return;
        }

        //regular mode
        if (window.lives !== undefined && window.lives < maxLives) {
            const oldLives = window.lives;
            window.lives = Math.min(maxLives, window.lives + healAmount);

            //withandfromand with game engine inwithand towithand withwithand
            if (typeof window.syncLives === 'function') {
                window.syncLives(window.lives);
            } else if (window.game && window.game.lives !== undefined) {
                window.game.lives = window.lives;
            }

            //Creating infrom effect
            this.createHealEffect();
        }
    }

    //atNOTand NOTbut to
    applyCoinShower() {
        //Checking tournament mode
        if (window.gameInstance && typeof window.gameInstance.score === 'number') {
            const oldScore = window.gameInstance.score;
            const bonusPoints = Math.floor(window.gameInstance.score * BOOST_CONSTANTS.EFFECTS.COIN_SHOWER.percentage);

            window.gameInstance.score += bonusPoints;
            console.log(` Coin Shower: +${bonusPoints} points (tournament mode)`);

            // Update UI with React callbacks
            if (window.gameInstance.updateDOMUI) {
                window.gameInstance.updateDOMUI();
            }

            this.createCoinEffect(bonusPoints);
            return;
        }

        //regular mode - gameEngine.score
        if (!window.gameEngine || window.gameEngine.score === undefined) {
            console.warn(' gameEngine.score is undefined, cannot apply COIN_SHOWER');
            return;
        }

        const oldScore = window.gameEngine.score;
        const bonusPoints = Math.floor(window.gameEngine.score * BOOST_CONSTANTS.EFFECTS.COIN_SHOWER.percentage);

        //Updating score gameEngine
        window.gameEngine.score += bonusPoints;

        //Updating UI
        if (window.gameEngine.updateScore) {
            window.gameEngine.updateScore();
        }

        //into Easter Egg Manager
        if (window.easterEggManager && window.easterEggManager.onScoreUpdate) {
            window.easterEggManager.onScoreUpdate(window.gameEngine.score);
        }

        //Creating infrom effect
        this.createCoinEffect(bonusPoints);
    }

    //atNOTand inbutin inin
    applyWaveBlast() {
        //Checking tournament mode
        let invaders = null;
        if (window.gameInstance && window.gameInstance.invaders) {
            invaders = window.gameInstance.invaders;
        } else if (window.gameEngine && window.gameEngine.invaders) {
            invaders = window.gameEngine.invaders;
        } else if (window.invaders) {
            invaders = window.invaders;
        }

        if (!invaders || invaders.length === 0) {
            return false; //inin false - boost NOT withfrom
        }

        //Checking with and andin enemyand
        const aliveInvaders = invaders.filter(inv => inv.alive);

        if (aliveInvaders.length === 0) {
            return false; //inin false - boost NOT withfrom
        }

        //onand with andand (towithandon Y toandon)
        let bottomRowY = -1;

        //withon on with and Y toandon withand andin enemyin
        for (const invader of aliveInvaders) {
            if (invader.y > bottomRowY) {
                bottomRowY = invader.y;
            }
        }

        //on inwith enemyin with Y toandon (inwith andand )
        if (bottomRowY >= 0) {
            const tolerance = 10; //towithto for withinNOTand Y toandon
            let destroyedCount = 0;

            for (let i = invaders.length - 1; i >= 0; i--) {
                const invader = invaders[i];

                if (invader.alive && Math.abs(invader.y - bottomRowY) <= tolerance) {
                    invader.alive = false;

                    //tournament mode - Adding points ondirect
                    if (window.gameInstance) {
                        const points = window.gameInstance.getCrabPoints ?
                            window.gameInstance.getCrabPoints(invader.type) : 100;
                        window.gameInstance.score += points;

                        if (window.gameInstance.createExplosion) {
                            const crabColor = window.gameInstance.getCrabColor ?
                                window.gameInstance.getCrabColor(invader.type) : '#ff6666';
                            window.gameInstance.createExplosion(
                                invader.x + invader.width / 2,
                                invader.y + invader.height / 2,
                                crabColor
                            );
                        }
                    }
                    //regular mode - destroyInvader
                    else if (window.destroyInvader) {
                        window.destroyInvader(invader, i);
                    }

                    destroyedCount++;
                }
            }

            //Creating infrom effect waves to if - andor
            if (destroyedCount > 0) {
                this.createWaveEffect();
                return true; //successfully withfrom
            }
        }

        return false; //NOT onand enemyin for andand
    }

    //atNOTand and withtowithand
    applySpeedTamer() {
        //defense from with toandinandand - towithand and in 500with
        const now = Date.now();
        if (this.lastSpeedTamerActivation && (now - this.lastSpeedTamerActivation) < 500) {
            return;
        }
        this.lastSpeedTamerActivation = now;
        
        this.speedTamerStacks++;
        
        //at effect to inwith enemy and boss
        this.updateEnemySpeeds();
        
        //Updating UI andandto
        this.updateSpeedTamerUI();
    }

    //atNOTand withbut with
    applyRandomChaos() {
        //withto inwith in boostin for Random Chaos
        const availableBoosts = [
            'RAPID_FIRE',
            'SHIELD_BARRIER',
            'SCORE_MULTIPLIER',
            'POINTS_FREEZE',
            'MULTI_SHOT',
            'HEALTH_BOOST',
            'PIERCING_BULLETS',
            'INVINCIBILITY',
            'GRAVITY_WELL',
            'RICOCHET',
            'ICE_FREEZE',
            'AUTO_TARGET',
            'COIN_SHOWER',
            'WAVE_BLAST',
            'SPEED_TAMER'
            //RANDOM_CHAOS, SCREAM, KNIFE to
        ];

        if (availableBoosts.length === 0) return false;

        //inand with with
        const randomBoost = availableBoosts[Math.floor(Math.random() * availableBoosts.length)];


        //NOTand with andbutwith from 10 to 15 withto (10000-15000 with)
        const randomDuration = Math.floor(Math.random() * (15000 - 10000 + 1)) + 10000;

        //inbut in andbutwith for with
        const originalDuration = BOOST_CONSTANTS.DURATIONS[randomBoost];
        BOOST_CONSTANTS.DURATIONS[randomBoost] = randomDuration;

        //at with
        const result = this.activateBoost(randomBoost);

        //inwithwithoninandin andandon andbutwith
        BOOST_CONSTANTS.DURATIONS[randomBoost] = originalDuration;

        return result;
    }

    //Check toandinbutwithand with
    isBoostActive(boostType) {
        return this.activeBoosts.has(boostType);
    }

    //Getting yes toandinbut with
    getActiveBoost(boostType) {
        return this.activeBoosts.get(boostType);
    }

    //Updating within
    update(deltaTime) {
        this.updateDroppingBoosts(deltaTime);
        this.updateActiveBoosts(deltaTime);
    }

    //Updating yesand within
    updateDroppingBoosts(deltaTime) {
        for (let i = this.droppingBoosts.length - 1; i >= 0; i--) {
            const boost = this.droppingBoosts[i];

            //Updating andand (IMPORTANT: multiply on deltatime for NOTinandwithand from FPS)
            boost.y += boost.speed * deltaTime;
            //deltatime butfrominbut to 60 FPS (~1.0), multiply on 16.67 (1000/60) for andto
            boost.age += deltaTime * 16.67;
            boost.glowPhase += deltaTime * 0.005; //animation withinand

            //Checking in lives (age in with, lifetime in with)
            const canvasHeight = (window.canvas && !isNaN(window.canvas.height)) ? window.canvas.height : 600;
            if (boost.age >= boost.lifetime || boost.y > canvasHeight) {
                this.droppingBoosts.splice(i, 1);
                continue;
            }

            //Checking withtobutinand with player
            if (this.checkBoostCollision(boost) && !boost.collected) {
                boost.collected = true; //as with from inbut toandinandand

                const activationResult = this.activateBoost(boost.type);

                if (activationResult) {
                    //Creating effect
                    this.createPickupEffect(boost);

                    //into easterEggManager with
                    if (window.easterEggManager) {
                        window.easterEggManager.onBoostPickup();
                    }
                }
                //Deleting with from array with after toandinandand
                this.droppingBoosts.splice(i, 1);
                i--; //totoand andtowith after yesand element
                continue; //and to with andandand
            }
        }
    }

    //⏰ Updating toandin within
    updateActiveBoosts(deltaTime) {
        for (const [boostType, boost] of this.activeBoosts) {
            //withto withtoNOT with (-1)
            if (boost.duration === -1) {
                continue;
            }
            
            const elapsed = Date.now() - boost.startTime;
            
            if (elapsed >= boost.duration) {
                this.deactivateBoost(boostType);
            }
        }
    }

    //toandinand with
    deactivateBoost(boostType) {
        const boost = this.activeBoosts.get(boostType);

        //Clearing timer for toinand toand memory
        if (boost) {
            if (boost.timerId) {
                clearTimeout(boost.timerId);
                boost.timerId = null;
            }
            if (boost.intervalId) {
                clearInterval(boost.intervalId);
                boost.intervalId = null;
            }
        }

        this.activeBoosts.delete(boostType);

        //withandon fromto for within - withwithin status bullets
        if (boostType === 'MULTI_SHOT') {
            this.resetMultiShotBullets();
        }

        if (boostType === 'AUTO_TARGET') {
            this.resetAutoTargetBullets();
        }

        //Creating effect toand
        this.createExpireEffect(boostType);
    }

    //Check withtobutinand with with
    checkBoostCollision(boost) {
        if (!window.player) {
            return false;
        }

        const collision = boost.x < window.player.x + window.player.width &&
                         boost.x + boost.width > window.player.x &&
                         boost.y < window.player.y + window.player.height &&
                         boost.y + boost.height > window.player.y;

        return collision;
    }

    //Rendering within
    render(ctx) {
        this.renderDroppingBoosts(ctx);
        this.renderActiveBoostsUI(ctx);
        this.renderSpeedTamerUI(ctx);
    }

    //Rendering yesand within
    renderDroppingBoosts(ctx) {
        for (const boost of this.droppingBoosts) {
            //defense from undefined andin
            if (!boost.type || !BOOST_CONSTANTS.INFO[boost.type]) {
                console.error(' Invalid boost type:', boost.type);
                continue;
            }
            
            const info = BOOST_CONSTANTS.INFO[boost.type];
            const rarityColor = BOOST_CONSTANTS.RARITY.COLORS[boost.rarity];
            const image = this.imageCache.get(boost.type);

            ctx.save();
            
            if (image && image.complete && image.naturalHeight !== 0) {
                //Draw fromand with to and withinand
                
                //Draw fromand with Saving and
                const aspectRatio = image.width / image.height;
                let drawWidth = boost.width;
                let drawHeight = boost.height;
                
                if (aspectRatio > 1) {
                    //fromand and, inwithto
                    drawHeight = drawWidth / aspectRatio;
                } else {
                    //fromand in, andto
                    drawWidth = drawHeight * aspectRatio;
                }
                
                //and fromand
                const drawX = boost.x + (boost.width - drawWidth) / 2;
                const drawY = boost.y + (boost.height - drawHeight) / 2;
                
                ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
            } else {
                //Fallback to and if fromand NOT andwith
                ctx.font = `${boost.width * 0.8}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.shadowBlur = 3;
                ctx.shadowColor = rarityColor;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;

                ctx.fillStyle = '#ffffff';
                ctx.fillText(
                    info ? info.icon : '',
                    boost.x + boost.width / 2,
                    boost.y + boost.height / 2
                );
            }
            
            ctx.restore();
        }
    }

    //Rendering UI toandin within - HTML NOT within from game
    renderActiveBoostsUI(ctx) {
        const activeBoosts = Array.from(this.activeBoosts.entries());
        const panel = document.getElementById('boostPanel');
        const content = document.getElementById('boostPanelContent');
        
        //Checking onandand elementin UI ( fromwithwithinin in tournamentbut mode)
        if (!panel || !content) {
            return;
        }
        
        if (activeBoosts.length === 0) {
            panel.classList.remove('show');
            return;
        }

        panel.classList.add('show');
        content.innerHTML = '';

        for (const [boostType, boost] of activeBoosts) {
            const info = BOOST_CONSTANTS.INFO[boostType];
            const rarity = this.getBoostRarity(boostType);
            const rarityColor = BOOST_CONSTANTS.RARITY.COLORS[rarity];

            const boostItem = document.createElement('div');
            boostItem.className = 'boost-item';

            //andtoto
            const icon = document.createElement('div');
            icon.className = 'boost-icon';
            
            //with in fromand inwith and
            const image = this.imageCache.get(boostType);
            if (image && image.complete && image.naturalHeight > 0) {
                icon.innerHTML = '';
                const img = document.createElement('img');
                img.src = image.src;
                img.style.width = '32px';
                img.style.height = '32px';
                img.style.objectFit = 'contain';
                icon.appendChild(img);
            } else {
                //Fallback to and
                icon.textContent = info ? info.icon : '';
                icon.style.color = rarityColor;
            }

            //andformand with
            const boostInfo = document.createElement('div');
            boostInfo.className = 'boost-info';

            //oninand
            const name = document.createElement('div');
            name.className = 'boost-name';
            name.textContent = info.name;
            name.style.color = rarityColor;

            //towith
            const rarityEl = document.createElement('div');
            rarityEl.className = 'boost-rarity';
            rarityEl.textContent = rarity.charAt(0) + rarity.slice(1).toLowerCase();
            rarityEl.style.color = rarityColor;

            //timer
            const timer = document.createElement('div');
            timer.className = 'boost-timer';

            if (boost.duration > 0) {
                const remaining = Math.max(0, boost.duration - (Date.now() - boost.startTime));
                const remainingSeconds = Math.ceil(remaining / 1000);
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                const timeStr = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;

                timer.textContent = `⏰ ${timeStr}`;
                timer.style.color = remainingSeconds <= 5 ? '#ff4444' : '#ffffff';

                //withwith
                const progress = remaining / boost.duration;
                const progressBar = document.createElement('div');
                progressBar.className = 'boost-progress';
                
                const progressFill = document.createElement('div');
                progressFill.className = 'boost-progress-bar';
                if (remainingSeconds <= 5) progressFill.classList.add('critical');
                progressFill.style.width = `${progress * 100}%`;
                
                progressBar.appendChild(progressFill);
                boostInfo.appendChild(progressBar);

            } else if (boost.duration === -1) {
                if (boostType === 'SHIELD_BARRIER') {
                    const hitsBlocked = boost.hitsBlocked || 0;
                    const remaining = BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits - hitsBlocked;

                    timer.textContent = ` ${remaining}/3 blocks`;
                    timer.style.color = remaining <= 1 ? '#ff4444' : '#ffffff';

                    //toand infrombut
                    const blocksContainer = document.createElement('div');
                    blocksContainer.className = 'boost-blocks';
                    
                    for (let i = 0; i < 3; i++) {
                        const block = document.createElement('div');
                        block.className = 'boost-block';
                        if (i >= remaining) block.classList.add('used');
                        blocksContainer.appendChild(block);
                    }
                    
                    boostInfo.appendChild(blocksContainer);
                } else {
                    timer.textContent = ' Permanent';
                    timer.style.color = '#00ff88';
                }
            }

            boostInfo.appendChild(name);
            boostInfo.appendChild(rarityEl);
            boostInfo.appendChild(timer);

            boostItem.appendChild(icon);
            boostItem.appendChild(boostInfo);
            content.appendChild(boostItem);
        }
    }

    //Updating HTML NOTand in but inand
    updateBoostPanel() {
        const panel = document.getElementById('boostPanel');
        if (!panel || !panel.classList.contains('show')) return;

        const activeBoosts = Array.from(this.activeBoosts.entries());
        const content = document.getElementById('boostPanelContent');
        
        //Checking onandand to ( fromwithwithinin in tournamentbut mode)
        if (!content) return;
        
        const boostItems = content.querySelectorAll('.boost-item');

        boostItems.forEach((item, index) => {
            if (index >= activeBoosts.length) return;

            const [boostType, boost] = activeBoosts[index];
            const timer = item.querySelector('.boost-timer');
            const progressBar = item.querySelector('.boost-progress-bar');
            const blocksContainer = item.querySelector('.boost-blocks');

            if (boost.duration > 0) {
                const remaining = Math.max(0, boost.duration - (Date.now() - boost.startTime));
                const remainingSeconds = Math.ceil(remaining / 1000);
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                const timeStr = minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;

                timer.textContent = `⏰ ${timeStr}`;
                timer.style.color = remainingSeconds <= 5 ? '#ff4444' : '#ffffff';

                if (progressBar) {
                    const progress = remaining / boost.duration;
                    progressBar.style.width = `${progress * 100}%`;
                    if (remainingSeconds <= 5) {
                        progressBar.classList.add('critical');
                    } else {
                        progressBar.classList.remove('critical');
                    }
                }

                //inandwithtoand and toand with
                if (remainingSeconds <= 0) {
                    this.renderActiveBoostsUI(null); //inin NOT
                }

            } else if (boost.duration === -1 && boostType === 'SHIELD_BARRIER') {
                const hitsBlocked = boost.hitsBlocked || 0;
                const remaining = BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits - hitsBlocked;

                timer.textContent = ` ${remaining}/3 blocks`;
                timer.style.color = remaining <= 1 ? '#ff4444' : '#ffffff';

                if (blocksContainer) {
                    const blocks = blocksContainer.querySelectorAll('.boost-block');
                    blocks.forEach((block, i) => {
                        if (i >= remaining) {
                            block.classList.add('used');
                        } else {
                            block.classList.remove('used');
                        }
                    });
                }
            }
        });
    }

    //rendering UI Speed Tamer
    renderSpeedTamerUI(ctx) {
        if (this.speedTamerStacks > 0 && window.canvas && !isNaN(window.canvas.height)) {
            const x = 10;
            const y = window.canvas.height - 60;

            //and background -

            //andtoto andtoand with into for andwithand
            ctx.font = '24px Arial';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.strokeText('', x + 10, y + 25);
            ctx.fillStyle = '#8844aa';
            ctx.fillText('', x + 10, y + 25);

            //butand with into
            if (this.speedTamerStacks > 1) {
                ctx.font = '16px Arial';
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeText(`x${this.speedTamerStacks}`, x + 40, y + 25);
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`x${this.speedTamerStacks}`, x + 40, y + 25);
            }
        }
    }

    //inwith method for creation effects
    createHealEffect() {
        //Creating effect and in player
        if (window.player && window.boostEffects) {
            window.boostEffects.createHealthBoostEffect(
                window.player.x + window.player.width / 2,
                window.player.y + window.player.height / 2
            );
        }
    }

    createCoinEffect(points) {
        //Creating infrom effect yesand NOT
        if (window.boostEffects && window.boostEffects.createCoinShowerEffect) {
            window.boostEffects.createCoinShowerEffect(points);
        } else {
            console.error(' Cannot create coin effect:', {
                hasBoostEffects: !!window.boostEffects,
                hasMethod: !!(window.boostEffects && window.boostEffects.createCoinShowerEffect)
            });
        }
    }

    createWaveEffect() {
        //Creating inbutin effect from player
        if (window.player && window.boostEffects) {
            const playerX = window.player.x + window.player.width / 2;
            const playerY = window.player.y + window.player.height / 2;
            window.boostEffects.createWaveBlastEffect(playerX, playerY);
        } else {
            console.error(' Cannot create wave effect:', {
                hasPlayer: !!window.player,
                hasBoostEffects: !!window.boostEffects
            });
        }
    }

    createPickupEffect(boost) {
        //fromand effect
    }

    createExpireEffect(boostType) {
        //fromand effect toand
    }

    updateEnemySpeeds() {
        //score withtowithand butwith in game.js - function NOT on
        //SPEED_TAMER: Speed calculation delegated to game.js
    }

    updateSpeedTamerUI() {
        //Updating andandto Speed Tamer
    }

    //Clearing at on new level
    clearForNewLevel() {
        //Clearing yesand with
        this.droppingBoosts = [];

        //Saving with, tofrom and on next level
        const persistentBoosts = new Map();
        
        for (const [boostType, boost] of this.activeBoosts) {
            //Speed Tamer and Shield Barrier withwith inwithyes
            if (boostType === 'SPEED_TAMER' || boostType === 'SHIELD_BARRIER') {
                persistentBoosts.set(boostType, boost);
            }
            //with withwith if and with in
            else if (boost.duration > 0) {
                const elapsed = Date.now() - boost.startTime;
                if (elapsed < boost.duration) {
                    persistentBoosts.set(boostType, boost);
                }
            }
        }

        this.activeBoosts = persistentBoosts;
    }

    //Check can and on next level
    canStartNextLevel() {
        return this.droppingBoosts.length === 0;
    }

    //function for inand withtobut andto
    drawRoundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    //withwith status MULTI_SHOT for inwith bullets
    resetMultiShotBullets() {
        //withwithin status for bullets in objectbut
        if (window.performanceOptimizer && window.performanceOptimizer.pools) {
            //Checking inwith bullets
            const poolNames = ['bullets', 'playerBullets'];
            for (const poolName of poolNames) {
                const bullets = window.performanceOptimizer.pools[poolName];
                if (bullets && Array.isArray(bullets)) {
                    for (let bullet of bullets) {
                        if (bullet && bullet.multiShot) {
                            bullet.multiShot = false;
                            bullet.vx = 0;
                            bullet.vy = -Math.abs(bullet.speed || 5); //Always upward
                            bullet.autoTarget = false; //Remove toandtoand and
                            delete bullet.originalVx;
                            delete bullet.originalVy;
                        }
                    }
                }
            }
        }

        //withwithin status for but array bullets
        if (window.bullets) {
            for (let bullet of window.bullets) {
                if (bullet && bullet.multiShot) {
                    bullet.multiShot = false;
                    bullet.vx = 0;
                    bullet.vy = -Math.abs(bullet.speed || 5); //Always upward
                    bullet.autoTarget = false; //Remove toandtoand and
                    delete bullet.originalVx;
                    delete bullet.originalVy;
                }
            }
        }

        //MULTI_SHOT status bullets with
    }

    //withwith status AUto_TARGET for inwith bullets
    resetAutoTargetBullets() {
        //withwithin status for bullets in objectbut
        if (window.performanceOptimizer && window.performanceOptimizer.pools) {
            //Checking inwith bullets
            const poolNames = ['bullets', 'playerBullets'];
            for (const poolName of poolNames) {
                const bullets = window.performanceOptimizer.pools[poolName];
                if (bullets && Array.isArray(bullets)) {
                    for (let bullet of bullets) {
                        if (bullet && bullet.autoTarget) {
                            bullet.autoTarget = false;
                            bullet.vx = 0;
                            bullet.vy = -Math.abs(bullet.speed || 5); //Always upward
                            bullet.multiShot = false; //Remove toandtoand and
                            delete bullet.originalVx;
                            delete bullet.originalVy;
                        }
                    }
                }
            }
        }

        //withwithin status for but array bullets
        if (window.bullets) {
            for (let bullet of window.bullets) {
                if (bullet && bullet.autoTarget) {
                    bullet.autoTarget = false;
                    bullet.vx = 0;
                    bullet.vy = -Math.abs(bullet.speed || 5); //Always upward
                    bullet.multiShot = false; //Remove toandtoand and
                    delete bullet.originalVx;
                    delete bullet.originalVy;
                }
            }
        }

        //AUto_TARGET status bullets with
    }
}

//Creating global instance
window.boostManager = new BoostManager();
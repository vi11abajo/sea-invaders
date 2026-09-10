//SEA INVADERS - BOSS SYSTEM
//Complete system with andtoand attackand, and and withwithwithbutwithand

class BossSystemV2 {
    constructor() {
        this.currentBoss = null;
        this.bossBullets = [];
        this.bossParticles = [];
        this.bossImages = {};
        this.bossImagesLoaded = {};
        this.bossGifData = {}; //for storing data GIF animation
        this.bossGifOverlay = null; //CSS overlay for GIF animation
        this.canvas = null;
        this.ctx = null;

        //effect for withwithwithbutwith
        this.playerBlindness = 0;
        this.playerFrozenBullets = [];
        this.frozenBulletsTime = 0;

        //Detect real mobile devices (NOT in)
        this.isRealMobile = this.detectRealMobile();

        this.initBossImages();
    }

    //DETECT REAL MOBILE DEVICES
    detectRealMobile() {
        //Checking User Agent for real mobile devices
        const ua = navigator.userAgent.toLowerCase();
        const isMobileUA = /iphone|ipad|ipod|android|webos|blackberry|iemobile|opera mini/.test(ua);

        //Checking for touch screen
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        //Checking screen size (real mobiles have smaller width)
        const isSmallScreen = window.innerWidth <= 768;

        //Checking for DeviceOrientationEvent (exists only on real devices)
        const hasOrientation = typeof DeviceOrientationEvent !== 'undefined';

        //Real mobile device must meet all criteria
        const isReal = isMobileUA && hasTouch && isSmallScreen;

        return isReal;
    }

    //BOSS configuration
    getBossConfig() {
        return {
            //inand inand within
            BOSS_LEVELS: [5, 10, 15, 20, 25],
            
            //in toandtoand
            BASE_HP: 50,
            HP_INCREASE_PER_BOSS: 25,
            BASE_SCORE: 1000,
            
            //and inandand
            WIDTH: 200,
            HEIGHT: 160,
            START_Y: 130,
            SPEED: 2.0, //Match old boss system speed
            
            //and parameter to
            BULLET_SPEED: 3,
            BULLET_SIZE: 10,
            
            //data within
            BOSSES: {
                1: {
                    name: 'Emerald Warlord',
                    color: '#33cc66',
                    image: 'images/crabBOSSGreen.webp',
                    phases: 1
                },
                2: {
                    name: 'Azure Leviathan',
                    color: '#3366ff',
                    image: 'images/crabBossBlue.webp',
                    phases: 2
                },
                3: {
                    name: 'Solar Kraken',
                    color: '#ffdd33',
                    image: 'images/crabBossYellow.webp',
                    phases: 3
                },
                4: {
                    name: 'Crimson Behemoth',
                    color: '#ff3333',
                    image: 'images/crabBossRed.webp',
                    phases: 4
                },
                5: {
                    name: 'Void Sovereign',
                    color: '#9966ff',
                    image: 'images/crabBossViolet.webp',
                    phases: 5
                }
            }
        };
    }

    //inand path to fromand
    detectImagesPath() {
        const currentPath = window.location.pathname;

        //Detect current theme from themeManager
        const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';

        let basePath;

        //for Coraluna withand coraluna
        if (currentPath.includes('/coraluna') || currentPath.includes('\\coraluna')) {
            basePath = `./themes/${currentTheme}/images`;
        }
        //for tournament withand current theme
        else if (currentPath.includes('/tournament/') || currentPath.includes('\\tournament\\')) {
            basePath = `../themes/${currentTheme}/images`;
        }
        //for withand current theme
        else {
            basePath = `themes/${currentTheme}/images`;
        }

        return basePath;
    }

    //Initialization fromand (uses from preloadManager)
    initBossImages() {
        const config = this.getBossConfig();

        //Creating overlay toNOT for GIF animation to on withto
        if (!this.isRealMobile) {
            this.createGifOverlay();
        }

        Object.keys(config.BOSSES).forEach(bossNumber => {
            const bossData = config.BOSSES[bossNumber];
            const fileName = bossData.image.replace('images/', '').replace('.png', '').replace('.webp', '');

            //withto: WEBP from preloadManager for withandbut fromand, GIF and
            if (!this.isRealMobile) {
                if (window.preloadManager && window.preloadManager.getImage) {
                    const preloadedBoss = window.preloadManager.getImage(fileName);

                    if (preloadedBoss && preloadedBoss.complete) {
                        this.bossImages[bossNumber] = preloadedBoss;
                        this.bossImagesLoaded[bossNumber] = true;

                        const gifPath = preloadedBoss.src.replace('.webp', '.gif').replace('.png', '.gif');
                        this.bossGifData[bossNumber] = {
                            isGif: true,
                            gifPath: gifPath,
                            gifLoaded: false,
                            pngImage: preloadedBoss
                        };
                    } else {
                        console.warn(` Boss ${bossNumber} NOT found in preloadManager: ${fileName}`);
                        this.bossImages[bossNumber] = null;
                        this.bossImagesLoaded[bossNumber] = false;
                    }
                } else {
                    console.warn(' preloadManager not available for boss images');
                    this.bossImages[bossNumber] = null;
                    this.bossImagesLoaded[bossNumber] = false;
                }
            }
            //and: Loading PNG ondirect (withandbut fromand) + GIF for animation
            else {
                const bossImg = new Image();
                const basePath = this.detectImagesPath();
                const pngPath = `${basePath}/${fileName}.png`;
                const gifPath = `${basePath}/${fileName}.gif`;

                bossImg.onload = () => {
                    this.bossImages[bossNumber] = bossImg;
                    this.bossImagesLoaded[bossNumber] = true;
                };

                bossImg.onerror = () => {
                    console.error(`❌ Failed to load mobile boss PNG: ${pngPath}`);
                    this.bossImages[bossNumber] = null;
                    this.bossImagesLoaded[bossNumber] = false;
                };

                bossImg.src = pngPath;

                // Mobile devices use the animated GIF too
                this.bossGifData[bossNumber] = {
                    isGif: true,
                    gifPath: gifPath,
                    gifLoaded: false,
                    pngImage: bossImg
                };
            }
        });
    }

    //Creating GIF OVERLAY
    createGifOverlay() {
        this.bossGifOverlay = document.createElement('div');
        this.bossGifOverlay.id = 'bossGifOverlay';
        this.bossGifOverlay.style.cssText = `
            position: absolute;
            pointer-events: none;
            z-index: 10001;
            display: none;
        `;

        //in tournamentbut mode Adding in tournament yes
        if (window.tournamentMode || typeof tournamentMode !== 'undefined' && tournamentMode) {
            //CRITICAL: Add GIF overlay to canvas wrapper, not modal!
            const canvasWrapper = document.querySelector('.game-canvas-wrapper');
            if (canvasWrapper) {
                canvasWrapper.appendChild(this.bossGifOverlay);
            } else {
                //Fallback to body if wrapper not found
                document.body.appendChild(this.bossGifOverlay);
            }
        } else {
            document.body.appendChild(this.bossGifOverlay);
        }
    }

    //🚀 LAZY LOADING: Loading GIF animation boss (to toyes boss inwith)
    loadBossGif(bossNumber) {
        const gifData = this.bossGifData[bossNumber];

        //Checking withto and GIF NOT (now on all devices, including mobile)
        if (gifData && gifData.isGif && !gifData.gifLoaded && gifData.gifPath) {

            const gifTest = new Image();
            gifTest.onload = () => {
                gifData.gifLoaded = true;
            };
            gifTest.onerror = () => {
                console.error(` ✗ Boss ${bossNumber} GIF load failed!`);
                gifData.isGif = false; //fromto on PNG
            };
            gifTest.src = gifData.gifPath;
        }
    }

    //Creating with
    createBoss(level) {
        if (!this.isBossLevel(level)) return null;

        const bossNumber = this.getBossNumber(level);
        const config = this.getBossConfig();
        const bossData = config.BOSSES[bossNumber];

        //🚀 LAZY LOADING: Loading GIF andand to toyes boss inwith
        this.loadBossGif(bossNumber);

        //withyes GIF overlay if was yes (onat, after game) - NOW ON ALL DEVICES
        if (!this.bossGifOverlay) {
            this.createGifOverlay();
        }

        //Getting canvas
        this.canvas = this.getCanvas();
        if (!this.canvas) {
            Logger.error(' Canvas not found for boss creation');
            return null;
        }
        this.ctx = this.canvas.getContext('2d');
        
        const maxHP = config.BASE_HP + (bossNumber - 1) * config.HP_INCREASE_PER_BOSS;
        
        this.currentBoss = {
            //in parameter
            x: this.canvas.width / 2 - config.WIDTH / 2,
            y: -config.HEIGHT,
            width: config.WIDTH,
            height: config.HEIGHT,
            
            //toandtoand
            bossNumber: bossNumber,
            name: bossData.name,
            color: bossData.color,
            maxHP: maxHP,
            currentHP: maxHP,
            
            //and state
            maxPhases: bossData.phases,
            currentPhase: 1,
            state: 'appearing',
            
            //inandand and animation
            speed: config.SPEED,
            direction: 1,
            baseY: config.START_Y,
            animationTime: 0,
            
            //toand
            lastAttackTime: 0,
            nextAttackDelay: 2000,
            
            //withwithwithbutwithand
            lastSpecialAbility: Date.now(), //Setting to in withwithbutwith NOT toandinandinwith with
            specialCooldown: this.getInitialSpecialCooldown(bossNumber),
            
            //withtheme andonandwithtoand toin
            spawnTime: Date.now(),
            
            //effect
            damageFlash: 0,
            damageSlowdown: 0, //and at andand damage
            phaseTransition: false,
            invulnerable: false,
            
            //andto data for toto boss
            uniqueData: this.initBossUniqueData(bossNumber)
        };
        
        return this.currentBoss;
    }

    //Initialization andto yes boss
    initBossUniqueData(bossNumber) {
        switch(bossNumber) {
            case 1: //Emerald Warlord
                return {
                    lastRegenTime: 0,
                    regenCooldown: 5000 + Math.random() * 5000, //from 5 to 10 withto
                    
                    //toandon attack (and toand)
                    lastSecondaryAttack: 0,
                    secondaryattackDelay: 1000 + Math.random() * 1200 //from 1.0 to 2.2 withto
                };
            case 2: //Azure Leviathan
                return {
                    shieldHP: 0,
                    maxShieldHP: 5
                };
            case 3: //Solar Kraken
                return {
                    explosiveBullets: [],
                    lastMeteorShower: 0,
                    meteorShowerCooldown: 12000 + Math.random() * 6000 //from 12 to 18 withto
                };
            case 4: //Crimson Behemoth
                return {
                    rageMode: false,
                    rageDuration: 0,
                    rageSpeedMultiplier: 1.0,
                    rageFrequencyMultiplier: 1.0,
                    immunetoSlowdown: false //fromonbut NOT andand
                };
            case 5: //Void Sovereign
                return {
                    clones: [],
                    portals: []
                };
            default:
                return {};
        }
    }

    //inwith function
    getCanvas() {
        return window.canvas || 
               document.getElementById('gameCanvas') || 
               document.getElementById('tournamentGameCanvas');
    }

    isBossLevel(level) {
        return this.getBossConfig().BOSS_LEVELS.includes(level);
    }

    getBossNumber(level) {
        const index = this.getBossConfig().BOSS_LEVELS.indexOf(level);
        return index !== -1 ? index + 1 : 0;
    }

    getBossHP(level) {
        const bossNumber = this.getBossNumber(level);
        const config = this.getBossConfig();
        return config.BASE_HP + (bossNumber - 1) * config.HP_INCREASE_PER_BOSS;
    }

    getBossScore(bossNumber) {
        const config = this.getBossConfig();
        return config.BASE_SCORE * bossNumber * 10;
    }

    //andonandwithtoand points boss with and inand
    getDynamicBossScore(boss) {
        const baseScore = this.getBossScore(boss.bossNumber);
        const currentTime = Date.now();
        const elapsedTime = currentTime - boss.spawnTime;
        
        //towith and for toin
        const DECAY_INTERVAL = 2500;  //2.5 seconds
        const DECAY_RATE = 0.01;      //1% interval
        const MIN_PERCENTAGE = 0.01;  //andand 1%
        
        //withwithandin toandwithin and intervalin
        const intervalsPassed = Math.floor(elapsedTime / DECAY_INTERVAL);
        
        //withwithandin current butand
        const decayAmount = intervalsPassed * DECAY_RATE;
        const scoreMultiplier = Math.max(MIN_PERCENTAGE, 1.0 - decayAmount);
        
        //inin andon points (but NOT 1)
        return Math.max(1, Math.floor(baseScore * scoreMultiplier));
    }

    //Updating with
    update(deltaTime) {
        if (!this.currentBoss) return;
        
        const boss = this.currentBoss;
        boss.animationTime += deltaTime;
        
        //Updating effect withwithwithbutwith
        this.updateSpecialEffects(deltaTime);
        
        //Updating state in inandwithand from
        switch(boss.state) {
            case 'appearing':
                this.updateAppearing(boss, deltaTime);
                break;
            case 'fighting':
                this.updateFighting(boss, deltaTime);
                break;
            case 'phase_transition':
                this.updatePhaseTransition(boss, deltaTime);
                break;
            case 'dying':
                this.updateDying(boss, deltaTime);
                break;
        }
        
        //Updating bullets and particle
        this.updateBossBullets(deltaTime);
        this.updateBossParticles(deltaTime);
    }

    //inand with
    updateAppearing(boss, deltaTime) {
        boss.y += 60 * deltaTime;
        
        if (boss.y >= boss.baseY) {
            boss.y = boss.baseY;
            boss.state = 'fighting';
        }
    }

    //state
    updateFighting(boss, deltaTime) {
        //inandand boss
        this.updateBossMovement(boss, deltaTime);
        
        //Checking with
        this.checkPhaseTransition(boss);
        
        //toand
        this.updateBossAttacks(boss);
        
        //toand toand (for toto within)
        this.updateSecondaryAttacks(boss);
        
        //withwithwithbutwithand
        this.updateSpecialAbilities(boss);
        
        //Remove effect damage
        if (boss.damageFlash > 0) {
            boss.damageFlash -= deltaTime;
        }
        
        //Remove and at andand damage (if NOT andand from Rage Mode)
        if (boss.damageSlowdown > 0 && !boss.uniqueData.immuneToSlowdown) {
            boss.damageSlowdown -= deltaTime;
        } else if (boss.uniqueData.immuneToSlowdown) {
            boss.damageSlowdown = 0; //butinbut and and in mode withand
        }
    }

    //and
    updatePhaseTransition(boss, deltaTime) {
        if (!boss.phaseTransition) {
            boss.phaseTransition = true;
            boss.invulnerable = true;
            
            //Creating effect with
            this.createPhaseTransitionEffect(boss);
            
            setTimeout(() => {
                boss.currentPhase++;
                boss.state = 'fighting';
                boss.phaseTransition = false;
                boss.invulnerable = false;
            }, 2000);
        }
    }

    //state withand
    updateDying(boss, deltaTime) {
        boss.y += 30 * deltaTime;

        //withtoin overlay at on andandand withand
        if (this.bossGifOverlay) {
            this.bossGifOverlay.style.display = 'none';
        }

        //Creating particle withand
        if (Math.random() < 0.3) {
            this.createDeathParticles(boss);
        }

        setTimeout(() => {
            this.currentBoss = null;
        }, 3000);
    }

    //inandand with
    updateBossMovement(boss, deltaTime) {
        //frombut inandand with and at damage
        let currentSpeed = boss.speed;
        if (boss.damageSlowdown > 0 && !boss.uniqueData.immuneToSlowdown) {
            currentSpeed = boss.speed * 0.5; //and in 2 at andand damage (if NOT andand)
        }
        boss.x += currentSpeed * boss.direction * deltaTime;
        
        //Check and
        if (boss.x <= 0) {
            boss.x = 0;
            boss.direction = 1;
        } else if (boss.x >= this.canvas.width - boss.width) {
            boss.x = this.canvas.width - boss.width;
            boss.direction = -1;
        }
        
        //inandtobut whileandinand
        const bobbing = Math.sin(boss.animationTime * 0.002) * 10;
        boss.y = boss.baseY + bobbing;
    }

    //Check with
    checkPhaseTransition(boss) {
        if (boss.currentPhase >= boss.maxPhases) return;
        
        const phaseThreshold = boss.maxHP * (boss.maxPhases - boss.currentPhase) / boss.maxPhases;
        
        if (boss.currentHP <= phaseThreshold && boss.state === 'fighting') {
            boss.state = 'phase_transition';
        }
    }

    //Updating to
    updateBossAttacks(boss) {
        const now = Date.now();
        
        //at andandto withfrom to for Rage Mode ( to)
        let effectiveAttackDelay = boss.nextAttackDelay;
        if (boss.uniqueData.rageFrequencyMultiplier) {
            effectiveAttackDelay = boss.nextAttackDelay / boss.uniqueData.rageFrequencyMultiplier;
        }
        
        if (now - boss.lastAttackTime >= effectiveAttackDelay) {
            this.performBossAttack(boss);
            boss.lastAttackTime = now;
            boss.nextAttackDelay = this.getAttackDelay(boss);
        }
    }

    //Updating toand to
    updateSecondaryAttacks(boss) {
        //toand toand to for in boss
        if (boss.bossNumber === 1) {
            const now = Date.now();
            
            if (now - boss.uniqueData.lastSecondaryAttack >= boss.uniqueData.secondaryAttackDelay) {
                this.performSecondaryAttack(boss);
                boss.uniqueData.lastSecondaryAttack = now;
                //Setting new to interval
                boss.uniqueData.secondaryattackDelay = 1000 + Math.random() * 1200; //1.0-2.2 withto
            }
        }
    }

    //Updating withwithwithbutwith
    updateSpecialAbilities(boss) {
        const now = Date.now();
        
        if (now - boss.lastSpecialAbility >= boss.specialCooldown) {
            this.activateSpecialAbility(boss);
            boss.lastSpecialAbility = now;
            //Updating toyes for with (to interval)
            boss.specialCooldown = this.getNextSpecialCooldown(boss.bossNumber);
        }
    }

    //Getting onbut toyeson withwithwithbutwithand
    getInitialSpecialCooldown(bossNumber) {
        switch(bossNumber) {
            case 1: //Emerald Warlord - with NOTandand
                return 5000 + Math.random() * 4000; //5-9 withto
            case 2: //Azure Leviathan
                return 7000 + Math.random() * 8000; //7-15 withto
            case 3: //Solar Kraken - Meteor Shower
                return 12000 + Math.random() * 6000; //12-18 withto
            case 4: //Crimson Behemoth - Rage Mode
                return 6000 + Math.random() * 4000; //6-10 withto
            case 5: //Void Sovereign - Temporal Freeze
                return 7000 + Math.random() * 8000; //7-15 withto
            default:
                return 15000;
        }
    }

    //Getting with toyeson withwithwithbutwithand
    getNextSpecialCooldown(bossNumber) {
        switch(bossNumber) {
            case 1: //Emerald Warlord - inand NOTandand
                return 5000 + Math.random() * 4000; //5-9 withto
            case 2: //Azure Leviathan
                return 7000 + Math.random() * 8000; //7-15 withto
            case 3: //Solar Kraken - Meteor Shower
                return 12000 + Math.random() * 6000; //12-18 withto
            case 4: //Crimson Behemoth - Rage Mode
                return 6000 + Math.random() * 4000; //6-10 withto
            case 5: //Void Sovereign - Temporal Freeze
                return 7000 + Math.random() * 8000; //7-15 withto
            default:
                return 15000;
        }
    }

    //inNOTand toand with
    performBossAttack(boss) {
        switch(boss.bossNumber) {
            case 1: //Emerald Warlord
                this.emeraldWarlordAttack(boss);
                break;
            case 2: //Azure Leviathan
                this.azureLeviathan(boss);
                break;
            case 3: //Solar Kraken
                this.solarKrakenAttack(boss);
                break;
            case 4: //Crimson Behemoth
                this.crimsonBehemothAttack(boss);
                break;
            case 5: //Void Sovereign
                this.voidSovereignAttack(boss);
                break;
        }
    }

    //inNOTand toandbut toand
    performSecondaryAttack(boss) {
        switch(boss.bossNumber) {
            case 1: //Emerald Warlord - and toand
                this.emeraldWarlordSecondaryAttack(boss);
                break;
            //and boss and withinand toand toand
        }
    }

    //Getting toand attackand
    getAttackDelay(boss) {
        const baseDelay = 2000;
        const phaseMultiplier = 1 - (boss.currentPhase - 1) * 0.2; //toyes = -20% to to
        return baseDelay * phaseMultiplier + Math.random() * 1000;
    }

    //toandinand withwithwithbutwithand
    activateSpecialAbility(boss) {
        switch(boss.bossNumber) {
            case 1: //Regeneration
                this.regenerationAbility(boss);
                break;
            case 2: //Water Shield
                this.waterShieldAbility(boss);
                break;
            case 3: //Meteor Shower
                this.meteorShowerAbility(boss);
                break;
            case 4: //Rage Mode
                this.rageModeAbility(boss);
                break;
            case 5: //Temporal Freeze
                this.temporalFreezeAbility(boss);
                break;
        }
    }

    //Updating effectin withwithwithbutwith
    updateSpecialEffects(deltaTime) {
        //withand player
        if (this.playerBlindness > 0) {
            this.playerBlindness -= deltaTime;
        }
        
        //to bullets
        if (this.frozenBulletsTime > 0) {
            this.frozenBulletsTime -= deltaTime;
            if (this.frozenBulletsTime <= 0) {
                this.unfreezeBullets();
            }
        }
        
        //mode withand for boss 4 - but in in andtoyes
        if (this.currentBoss && this.currentBoss.uniqueData.rageMode) {
            const now = Date.now();
            const elapsed = now - this.currentBoss.uniqueData.rageStartTime;
            
            if (elapsed >= this.currentBoss.uniqueData.rageDuration) {
                //into mode withand and withwithin inwith andandto
                this.currentBoss.uniqueData.rageMode = false;
                this.currentBoss.speed = this.getBossConfig().SPEED; //inin but speed
                this.currentBoss.uniqueData.rageSpeedMultiplier = 1.0; 
                this.currentBoss.uniqueData.rageFrequencyMultiplier = 1.0;
                this.currentBoss.uniqueData.immunetoSlowdown = false; //Remove andand
                
            }
        }
    }

    //onNOTwithand damage boss
    damageBoss(damage) {
        if (!this.currentBoss || this.currentBoss.invulnerable || this.currentBoss.state === 'dying') {
            return { hit: false, killed: false, score: 0 };
        }
        
        const boss = this.currentBoss;
        
        //Checking and for boss 2
        if (boss.bossNumber === 2 && boss.uniqueData.shieldHP > 0) {
            boss.uniqueData.shieldHP--;
            this.createShieldHitEffect(boss);
            
            //if and , Starting withto
            if (boss.uniqueData.shieldHP <= 0) {
                this.azureLeviathanceShieldBreakAttack(boss);
            }
            
            return { hit: true, killed: false, score: 0 };
        }
        
        //onbutwithand damage
        boss.currentHP -= damage;
        boss.damageFlash = 300; //effect andand on 300with

        //sound yesand boss
        if (window.soundManager) {
            soundManager.playSound('bossHit', 1.0);
        }

        //for boss at andand damage (as in with with)
        boss.damageSlowdown = 2000; //and on 2 seconds

        //Creating particle yesand
        this.createHitParticles(boss);
        
        //with boss 4 toandinandwith to with withand withwithbutwith
        
        //Checking with
        if (boss.currentHP <= 0) {
            boss.currentHP = 0;
            boss.state = 'dying';

            //withtoin GIF overlay NOTbut at withand boss
            if (this.bossGifOverlay) {
                this.bossGifOverlay.style.display = 'none';
            }

            //Clearing inwith bullets boss at withand
            this.bossBullets = [];
            
            //withwithandin toandwithin HP for inwithwithbutinand: boss 1 = +1 HP, boss 2 = +2 HP, and ..
            const healAmount = boss.bossNumber;
            
            //andonandwithtoand points with and inand
            const score = this.getDynamicBossScore(boss);
            
            return { hit: true, killed: true, score: score, healAmount: healAmount };
        }
        
        return { hit: true, killed: false, score: 0 };
    }

    //Check tofromand with bulletsand player
    checkCollisionWithPlayerBullets(playerBullets) {
        if (!this.currentBoss) return { bulletsToRemove: [], result: { hit: false, killed: false, score: 0 } };
        
        const boss = this.currentBoss;
        const bulletsToRemove = [];
        let result = { hit: false, killed: false, score: 0 };
        
        for (let i = 0; i < playerBullets.length; i++) {
            const bullet = playerBullets[i];
            
            //Checking withand
            if (bullet.x < boss.x + boss.width &&
                bullet.x + bullet.width > boss.x &&
                bullet.y < boss.y + boss.height &&
                bullet.y + bullet.height > boss.y) {
                
                bulletsToRemove.push(i);
                result = this.damageBoss(1);
                break; //on bullet = and damage
            }
        }
        
        return { bulletsToRemove, result };
    }

    //Check tofromand bullets with with player
    checkCollisionWithPlayer(player) {
        const bulletsToRemove = [];
        let playerHit = false;
        
        for (let i = this.bossBullets.length - 1; i >= 0; i--) {
            const bullet = this.bossBullets[i];
            
            if (bullet.x < player.x + player.width &&
                bullet.x + bullet.width > player.x &&
                bullet.y < player.y + player.height &&
                bullet.y + bullet.height > player.y) {
                
                bulletsToRemove.push(i);
                this.bossBullets.splice(i, 1);
                playerHit = true;
            }
        }
        
        return playerHit;
    }

    //Updating bullets with
    updateBossBullets(deltaTime) {
        if (!this.canvas) return;
        
        this.bossBullets = this.bossBullets.filter(bullet => {
            //Updating andand
            bullet.x += bullet.vx * deltaTime;
            bullet.y += bullet.vy * deltaTime;
            
            //Adding with (to on and for frominandbutwithand)
            if (!bullet.trail) bullet.trail = [];
            bullet.trail.push({ x: bullet.x + bullet.width/2, y: bullet.y + bullet.height/2 });
            const maxTrailLength = this.isRealMobile ? 3 : 6;
            if (bullet.trail.length > maxTrailLength) bullet.trail.shift();
            
            //withandon andto for andin bullets
            this.updateSpecialBullet(bullet, deltaTime);
            
            //Deleting if in and
            return bullet.y < this.canvas.height + 50 &&
                   bullet.x > -50 &&
                   bullet.x < this.canvas.width + 50 &&
                   bullet.y > -50;
        });
    }

    //Updating withand bullets
    updateSpecialBullet(bullet, deltaTime) {
        switch(bullet.type) {
            case 'zigzag':
                bullet.zigzagTime += deltaTime;
                const zigzagInterval = 30; //with infrom to 30with
                const nextChangeTime = zigzagInterval * (bullet.zigzagCounter + 1);
                
                //logging to 5 to for fromwithandinand
                if (Math.floor(bullet.zigzagTime) % 5 === 0) {
                }
                
                //Checking, and oninand
                if (bullet.zigzagTime >= nextChangeTime && bullet.zigzagCounter < 6) { //inandand to 6 infromin for with and
                    const oldVx = bullet.vx;
                    bullet.vx = -bullet.vx; //andinand oninand
                    bullet.zigzagCounter++; //inandandin scoreandto
                    
                }
                break;
            case 'explosive':
                if (bullet.timer) {
                    bullet.timer -= deltaTime;
                    if (bullet.timer <= 0) {
                        this.explodeBullet(bullet);
                    }
                }
                break;
            case 'homing':
                //with withoninand on player
                if (window.player) {
                    const dx = (window.player.x + window.player.width/2) - (bullet.x + bullet.width/2);
                    const dy = (window.player.y + window.player.height/2) - (bullet.y + bullet.height/2);
                    const distance = Math.sqrt(dx*dx + dy*dy);
                    
                    if (distance > 0) {
                        const homingStrength = 0.5;
                        bullet.vx += (dx / distance) * homingStrength * deltaTime;
                        bullet.vy += (dy / distance) * homingStrength * deltaTime;
                    }
                }
                break;
        }
    }

    //Updating particles
    updateBossParticles(deltaTime) {
        this.bossParticles = this.bossParticles.filter(particle => {
            particle.x += particle.vx * deltaTime;
            particle.y += particle.vy * deltaTime;
            particle.vy += 0.1 * deltaTime; //inandand
            particle.life -= deltaTime;

            //inand for to
            if (particle.type === 'candy' && particle.rotationSpeed) {
                particle.rotation += particle.rotationSpeed * deltaTime;
            }

            return particle.life > 0;
        });
    }

    //Creating effectin and particles

    //effect yesand
    createHitParticles(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;

        //Checking toandinon and Halloween theme
        const isHalloween = window.themeManager && window.themeManager.getCurrentTheme() === 'halloween';

        //but toandwithin to to 3
        const particleCount = 3;

        //oninand filein to for Halloween
        const candyImages = ['boil.png', 'cake.png', 'cat.png', 'frank.png', 'ghost.png', 'hat.png', 'lolly.png', 'lolly2.png', 'pumpkin.png'];

        for (let i = 0; i < particleCount; i++) {
            const particle = {
                x: centerX + (Math.random() - 0.5) * boss.width * 0.6,
                y: centerY + (Math.random() - 0.5) * boss.height * 0.6,
                vx: (Math.random() - 0.5) * 8, //with with
                vy: (Math.random() - 0.5) * 8 - 2, //NOTbut inin
                life: isHalloween ? 60 : 30, //to andin to
                maxLife: isHalloween ? 60 : 30,
                size: isHalloween ? Math.random() * 10 + 20 : Math.random() * 2 + 1, //toNOT: 20-30px
                type: isHalloween ? 'candy' : 'hit',
                rotation: isHalloween ? Math.random() * Math.PI * 2 : 0,
                rotationSpeed: isHalloween ? (Math.random() - 0.5) * 0.2 : 0
            };

            //for Halloween Adding path to fromand to
            if (isHalloween) {
                const candyName = candyImages[Math.floor(Math.random() * candyImages.length)];
                const currentTheme = window.themeManager.getCurrentTheme();
                particle.candyImage = `/themes/${currentTheme}/images/boss/${candyName}`;
            } else {
                particle.color = '#ffff00';
            }

            this.bossParticles.push(particle);
        }
    }

    //effect yesand in and
    createShieldHitEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;
        
        for (let i = 0; i < 6; i++) {
            this.bossParticles.push({
                x: centerX,
                y: centerY,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 25,
                maxLife: 25,
                size: Math.random() * 3 + 2,
                color: '#0099ff',
                type: 'shield_hit'
            });
        }
        
    }

    //effect withand
    createDeathParticles(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;
        
        for (let i = 0; i < 5; i++) {
            this.bossParticles.push({
                x: centerX + (Math.random() - 0.5) * boss.width,
                y: centerY + (Math.random() - 0.5) * boss.height,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 40,
                maxLife: 40,
                size: Math.random() * 4 + 2,
                color: boss.color,
                type: 'death'
            });
        }
    }

    //effect with
    createPhaseTransitionEffect(boss) {
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;

        //on and particles for frominandbutwithand
        const particleCount = this.isRealMobile ? 16 : 32;

        //Creating toin in particles
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const radius = 20;

            this.bossParticles.push({
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                vx: Math.cos(angle) * 3,
                vy: Math.sin(angle) * 3,
                life: 60,
                maxLife: 60,
                size: 4,
                color: boss.color,
                type: 'phase_transition'
            });
        }

    }

    //effect inin
    createExplosionParticles(x, y, color) {
        for (let i = 0; i < 12; i++) {
            this.bossParticles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 40,
                maxLife: 40,
                size: Math.random() * 4 + 2,
                color: color,
                type: 'explosion'
            });
        }
    }

    //effect andand
    createTeleportEffect(x, y) {
        for (let i = 0; i < 15; i++) {
            this.bossParticles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 30,
                maxLife: 30,
                size: Math.random() * 3 + 1,
                color: '#9966ff',
                type: 'teleport'
            });
        }
    }

    getCurrentBoss() {
        return this.currentBoss;
    }

    getBossBullets() {
        return this.bossBullets;
    }

    getBossParticles() {
        return this.bossParticles;
    }

    clearBoss() {
        this.currentBoss = null;
        this.bossBullets = [];
        this.bossParticles = [];
        this.playerBlindness = 0;
        this.playerFrozenBullets = [];
        this.frozenBulletsTime = 0;

        //withtoin GIF overlay
        if (this.bossGifOverlay) {
            this.bossGifOverlay.style.display = 'none';
        }
    }

    //Clearing withwithin GIF
    cleanupGifElements() {
        //Deleting overlay
        if (this.bossGifOverlay && this.bossGifOverlay.parentNode) {
            this.bossGifOverlay.parentNode.removeChild(this.bossGifOverlay);
            this.bossGifOverlay = null;
        }

        //Clearing data
        this.bossGifData = {};
    }

    getBossStatus() {
        if (!this.currentBoss) return null;
        
        return {
            name: this.currentBoss.name,
            currentHP: this.currentBoss.currentHP,
            maxHP: this.currentBoss.maxHP,
            currentPhase: this.currentBoss.currentPhase,
            maxPhases: this.currentBoss.maxPhases,
            state: this.currentBoss.state
        };
    }

}

//towithand with within
try {
    window.BossSystemV2 = BossSystemV2;
    window.BossSystem = BossSystemV2; //for withinwithandwithand

} catch (error) {
    console.error(' CRITICAL: Failed to export BossSystemV2:', error);
    console.error(' Error name:', error.name);
    console.error(' Error message:', error.message);
    console.error(' Error stack:', error.stack);
}

//SEA INVADERS - GAME ENGINE
//Core game engine class
//VERSION: 20251218005

import { GAME_CONSTANTS, MAX_LIVES, PERFORMANCE_SETTINGS } from './game-constants.js';
import { DEFAULT_CONFIG } from './game-config.js';
import { fastCollisionCheck, broadPhaseCollisionCheck } from '../systems/physics.js';
import { clearAllGameTimers, createSafeTimeout } from '../systems/utils.js';
import { setPlayerShadow, setCrabShadow, clearShadow } from '../systems/rendering.js';
import { ToastySystem, SailorSystem, ScreamSystem, KnifeGhostSystem, EasterEggManager } from '../features/easter-eggs.js';

export class GameEngine {
    constructor(config = {}) {
        //Game mode
        this.mode = config.mode || 'regular';
        this.page = this.detectPage();

        //Configuration
        this.config = { ...DEFAULT_CONFIG, ...config };

        //React callbacks for UI updates
        this.onScoreUpdate = config.onScoreUpdate || null;
        this.onLivesUpdate = config.onLivesUpdate || null;
        this.onLevelUpdate = config.onLevelUpdate || null;
        this.onGameOver = config.onGameOver || null;

        //Game state
        this.gameState = 'start';
        this.score = 0;
        this.lives = this.config.PLAYER_LIVES || 5;
        this.level = 1;
        this.gameSpeed = 1;
        this.enemiesKilled = 0;

        //Canvas
        this.canvas = null;
        this.ctx = null;
        this.deltaTime = 0;
        this.lastTime = 0;

        //Game objects
        this.player = {
            x: 290,
            y: 1080,
            width: 98,
            height: 98,
            speed: 10
        };

        this.bullets = [];
        this.invaders = [];
        this.invaderBullets = [];
        this.particles = [];
        this.ripples = [];
        this.healEffects = [];

        //Enemies
        this.invaderRows = this.config.INVADERS_ROWS || 5;
        this.invaderCols = this.config.INVADERS_COLS || 7; // Changed from 8 to 7
        this.invaderWidth = 90;  // Scaled up 1.5x (was 60)
        this.invaderHeight = 78; // Scaled up 1.5x (was 52)
        this.invaderSpeed = this.config.CRAB_SPEED_BASE || 1;
        this.invaderDirection = 1;
        this.invaderDropDistance = 25;

        //Controls
        this.keys = {};
        this.lastShotTime = 0;
        this.shotCooldown = 300;

        //Images
        this.images = {
            player: {
                front: null,
                left: null,
                right: null,
                ouch: null,
                loaded: {
                    front: false,
                    left: false,
                    right: false,
                    ouch: false
                }
            },
            crabs: {},
            crabsLoaded: {},
            // Cache of pre-scaled player images (high quality)
            playerScaledCache: {
                front: null,
                left: null,
                right: null,
                ouch: null
            },
            // Cache of pre-scaled crab images (high quality)
            crabsScaledCache: {}
        };

        this.playerIsHurt = false;
        this.hurtTimeout = null;

        //Bosses
        this.bossActive = false;
        this.bossSystemV2 = null;

        //Easter Eggs
        this.toastySystem = new ToastySystem();
        this.sailorSystem = new SailorSystem();
        //Halloween-specific easter eggs are initialized only for Halloween theme
        this.screamSystem = null;
        this.knifeGhostSystem = null;
        this.easterEggManager = new EasterEggManager(this.toastySystem, this.sailorSystem);

        //Score
        this.levelStartTime = 0;
        this.currentScoreMultiplier = 1.0;
        this.pointsFreezeTotalTime = 0; //Total time of decay freeze
        this.scoreAlreadySaved = false;
        this.currentGameSession = null;

        //Transitions
        this.levelTransitionActive = false;

        //Performance
        this.performanceOptimizer = null;
        this.performanceMonitor = null;

        //Tournament mode
        this.tournamentMode = false;
        this.tournamentData = null;

        //Touch controls
        this.touchData = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            currentY: 0,
            touchingPlayer: false
        };
        this.touchShootInterval = null;
    }

    detectPage() {
        const path = window.location.pathname;
        if (path.includes('coraluna')) return 'coraluna';
        if (path.includes('tournament')) return 'tournament';
        return 'index';
    }

    async init() {
        //Canvas initialization
        this.initCanvas();

        //Load images
        await this.loadImages();

        //Boss system initialization
        if (window.BossSystemV2) {
            this.bossSystemV2 = new BossSystemV2();
        }

        //Easter Eggs initialization
        this.toastySystem.init(this.tournamentMode);
        this.sailorSystem.init(this.tournamentMode);

        //Initialize Halloween-specific easter eggs only for Halloween theme
        const currentTheme = window.themeManager ? window.themeManager.currentTheme : 'default';
        if (currentTheme === 'halloween') {
            this.screamSystem = new ScreamSystem();
            this.knifeGhostSystem = new KnifeGhostSystem();
            this.screamSystem.init(this.tournamentMode);
            this.knifeGhostSystem.init(this.tournamentMode);
        }

        this.easterEggManager.init();
        this.easterEggManager.gameState = () => this.gameState;

        //Initialization inand
        this.initControls();

        //Initialization Performance Optimizer
        if (window.PerformanceOptimizer) {
            this.performanceOptimizer = new PerformanceOptimizer();
        }

        //Initialization Performance Monitor (if with)
        if (window.PerformanceMonitor) {
            this.performanceMonitor = new PerformanceMonitor();
        }

        //towith in window for withinwithandwithand with withwithinandand withthemeand
        this.exportToWindow();
    }

    initCanvas() {
        const canvasId = this.config.canvasId || 'gameCanvas';
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(` Canvas not found: ${canvasId}`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
    }

    async loadImages() {
        //andfromand: fromand from preloadManager
        if (window.preloadManager && window.preloadManager.getImage) {

            //Loading fromand player from preloadManager
            const playerImages = ['front', 'left', 'right', 'ouch'];
            for (const imgType of playerImages) {
                const preloadedImg = window.preloadManager.getImage(`player_${imgType}`);
                if (preloadedImg && preloadedImg.complete) {
                    this.images.player[imgType] = preloadedImg;
                    this.images.player.loaded[imgType] = true;
                } else {
                    this.images.player.loaded[imgType] = false;
                    console.warn(` Preloaded player image not found: ${imgType}`);
                }
            }

            //Loading fromand toin from preloadManager
            const crabTypes = ['Green', 'Blue', 'Yellow', 'Red', 'Violet'];
            for (const type of crabTypes) {
                const key = `crab_${type.toLowerCase()}`;
                const preloadedImg = window.preloadManager.getImage(key);
                if (preloadedImg && preloadedImg.complete) {
                    this.images.crabs[type] = preloadedImg;
                    this.images.crabsLoaded[type] = true;
                } else {
                    this.images.crabsLoaded[type] = false;
                    console.warn(`❌ Crab image not loaded: ${type}`);
                }
            }

            //Creating inwithtotowithin inandbut fromwithandin inwithandand
            await this.createHighQualityScaledImages();

            //ininwith with - fromand
            return;
        }

        //FALLBACK: if preloadManager NOTtowith, Loading fromand andand withwith
        console.warn(' PreloadManager not available, loading images directly...');
        const playerImages = ['front', 'left', 'right', 'ouch'];
        const loadPromises = [];

        for (const imgType of playerImages) {
            const img = new Image();
            loadPromises.push(new Promise((resolve) => {
                img.onload = () => {
                    this.images.player[imgType] = img;
                    this.images.player.loaded[imgType] = true;
                    resolve();
                };
                img.onerror = (error) => {
                    this.images.player.loaded[imgType] = false;
                    console.error(` Failed to load player image: ${imgType}`, img.src);
                    resolve();
                };
            }));

            if (window.themeManager && window.themeManager.isInitialized) {
                img.src = window.themeManager.getImagePath('player', imgType);
            } else {
                img.src = `themes/default/images/octopi${imgType.charAt(0).toUpperCase() + imgType.slice(1)}.png`;
            }
        }

        //Loading fromand toin
        const crabTypes = ['Green', 'Blue', 'Yellow', 'Red', 'Violet'];
        for (const type of crabTypes) {
            const img = new Image();
            loadPromises.push(new Promise((resolve) => {
                img.onload = () => {
                    this.images.crabs[type] = img;
                    this.images.crabsLoaded[type] = true;
                    resolve();
                };
                img.onerror = (error) => {
                    this.images.crabsLoaded[type] = false;
                    console.error(` Failed to load crab image: ${type}`, img.src);
                    resolve();
                };
            }));

            if (window.themeManager && window.themeManager.isInitialized) {
                img.src = window.themeManager.getImagePath('enemies', `crab${type}`);
            } else {
                img.src = `themes/default/images/crab${type}.png`;
            }
        }

        await Promise.all(loadPromises);

        //Creating scaled images after loading
        await this.createHighQualityScaledImages();
    }

    //Creating inwithtotowithin inandbut fromwithandin fromand player and enemyin
    async createHighQualityScaledImages() {
        //Scale the player sprites (+40% size)
        const playerTypes = [
            { key: 'front', width: 102.48, height: 98 },
            { key: 'left', width: 98.88, height: 98 },
            { key: 'right', width: 98.88, height: 98 },
            { key: 'ouch', width: 125.24, height: 102.58 }
        ];

        //Create player images asynchronously to avoid UI freeze
        for (const { key, width, height } of playerTypes) {
            const originalImg = this.images.player[key];
            if (!originalImg || !originalImg.complete) continue;

            //Yield to browser to prevent UI freeze
            await new Promise(resolve => requestAnimationFrame(resolve));
            this.images.playerScaledCache[key] = this._createScaledImage(originalImg, width, height);
        }

        //withandinand fromand toin
        const crabTypes = ['Green', 'Blue', 'Yellow', 'Red', 'Violet'];
        const crabWidth = this.invaderWidth;   // 90px (scaled up 1.5x)
        const crabHeight = this.invaderHeight; // 78px (scaled up 1.5x)

        //Create crab images asynchronously to avoid UI freeze
        for (const type of crabTypes) {
            const originalImg = this.images.crabs[type];
            if (!originalImg || !originalImg.complete) continue;

            //Yield to browser to prevent UI freeze
            await new Promise(resolve => requestAnimationFrame(resolve));
            this.images.crabsScaledCache[type] = this._createScaledImage(originalImg, crabWidth, crabHeight);
        }
    }

    //inwithon function for creation inwithtotowithinbut withandinbut fromand
    _createScaledImage(originalImg, width, height) {
        //Creating in canvas for inwithtotowithinbut withandinand
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        //Setting canvas andon
        tempCanvas.width = Math.ceil(width);
        tempCanvas.height = Math.ceil(height);

        //into inwithtotowithinbut withandinand
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        //inbut withandinand for towithin
        //1: to but (50% from andandon)
        const intermediateCanvas = document.createElement('canvas');
        const intermediateCtx = intermediateCanvas.getContext('2d');
        intermediateCanvas.width = originalImg.width / 2;
        intermediateCanvas.height = originalImg.height / 2;

        intermediateCtx.imageSmoothingEnabled = true;
        intermediateCtx.imageSmoothingQuality = 'high';
        intermediateCtx.drawImage(originalImg, 0, 0, intermediateCanvas.width, intermediateCanvas.height);

        //2: to andonbut
        tempCtx.drawImage(intermediateCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

        return tempCanvas;
    }

    initControls() {
        //Keyboard
        document.addEventListener('keydown', (e) => {
            //andbutand if in in field ininyes
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            //fromto to on toinand P (fromandwithto toinand, NOTinand from withtotoand)
            if (e.code === 'KeyP') {
                if (this.gameState === 'playing') {
                    this.pauseGame();
                    e.preventDefault();
                    return;
                } else if (this.gameState === 'paused') {
                    this.resumeGame();
                    e.preventDefault();
                    return;
                }
            }

            this.keys[e.key] = true;
            if (e.key === ' ' && this.gameState === 'playing') {
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            //andbutand if in in field ininyes
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            this.keys[e.key] = false;
        });

        //Touch controls - ALWAYS on touch devices
        if (typeof window !== 'undefined' &&
            ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
            this.initTouchControls();
        }
    }

    initTouchControls() {
        //passive: false and preventDefault
        const touchOptions = { passive: false };

        this.canvas.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();

            //withand toandon touch to canvas
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const touchX = (touch.clientX - rect.left) * scaleX;
            const touchY = (touch.clientY - rect.top) * scaleY;

            //Checking towithand player
            if (this.isTouchingPlayer(touchX, touchY)) {
                e.preventDefault(); //toin withto and
                this.touchData.active = true;
                this.touchData.touchingPlayer = true;
                this.touchData.currentX = touchX;
                this.touchData.currentY = touchY;
                //andon withand from player
                this.touchData.offsetX = touchX - (this.player.x + this.player.width / 2);
                this.touchData.offsetY = touchY - (this.player.y + this.player.height / 2);
                this.startTouchShooting();
            }
        }, touchOptions);

        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.touchData.active || !this.touchData.touchingPlayer) return;

            e.preventDefault(); //toin withto in in and
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();

            //withand toandon touch to canvas
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            this.touchData.currentX = (touch.clientX - rect.left) * scaleX;
            this.touchData.currentY = (touch.clientY - rect.top) * scaleY;
        }, touchOptions);

        this.canvas.addEventListener('touchend', () => {
            this.touchData.active = false;
            this.touchData.touchingPlayer = false;
            this.stopTouchShooting();
        }, touchOptions);

        this.canvas.addEventListener('touchcancel', () => {
            this.touchData.active = false;
            this.touchData.touchingPlayer = false;
            this.stopTouchShooting();
        }, touchOptions);
    }

    isTouchingPlayer(touchX, touchY) {
        //inandandin with towithand on 20 andtowith with inwith with
        const padding = 20;
        return touchX >= this.player.x - padding &&
               touchX <= this.player.x + this.player.width + padding &&
               touchY >= this.player.y - padding &&
               touchY <= this.player.y + this.player.height + padding;
    }

    startTouchShooting() {
        if (this.touchShootInterval) return;
        //inin with (to 50ms), createBullet() with toand cooldown
        //yes to speed with as on to
        this.touchShootInterval = setInterval(() => {
            if (this.gameState === 'playing' && this.touchData.active) {
                this.createBullet();
            }
        }, 50);
    }

    stopTouchShooting() {
        if (this.touchShootInterval) {
            clearInterval(this.touchShootInterval);
            this.touchShootInterval = null;
        }
    }

    start() {
        this.gameState = 'playing';
        this.score = 0;
        this.lives = this.config.PLAYER_LIVES || 5;
        this.level = 1;
        this.gameSpeed = 1;
        this.invaderSpeed = this.config.CRAB_SPEED_BASE || 1; //withwith withtowithand enemyin to onbut
        this.bossActive = false;
        this.levelTransitionActive = false;

        //Clearing arrayin
        this.bullets = [];
        this.invaders = [];
        this.invaderBullets = [];
        this.particles = [];
        this.ripples = [];
        this.healEffects = [];

        //Creating enemyin
        this.createInvaders();

        //withwith Easter Eggs
        if (this.easterEggManager) {
            this.easterEggManager.destroy();
            this.easterEggManager.init();
        }

        //Initialization toin in
        this.initLevelScoring();

        //towith in window for andand towithbutwithand for inNOTand with
        this.exportToWindow();

        //withto andin andto
        this.lastTime = performance.now();
        this.gameLoop(this.lastTime);
    }

    gameLoop(currentTime) {
        if (this.gameState !== 'playing' && this.gameState !== 'paused') return;

        //Calculate delta time
        this.deltaTime = (currentTime - this.lastTime) * 0.06; //Normalize to 60 FPS
        this.lastTime = currentTime;

        //Update to if NOT on
        if (this.gameState === 'playing') {
            this.update(this.deltaTime);
        }

        //Render inwithyes ( whilein to )
        this.render();

        //Rendering text in inwith
        if (this.gameState === 'paused') {
            this.renderPauseScreen();
        }

        //Continue loop
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    pauseGame() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
        }
    }

    resumeGame() {
        if (this.gameState === 'paused') {
            this.gameState = 'playing';
        }
    }

    renderPauseScreen() {
        //overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        //towith "PAUSED"
        this.ctx.save();
        this.ctx.font = 'bold 48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        //
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowOffsetX = 3;
        this.ctx.shadowOffsetY = 3;

        //and for text
        const gradient = this.ctx.createLinearGradient(0, this.canvas.height / 2 - 50, 0, this.canvas.height / 2 + 50);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(1, '#FFA500');
        this.ctx.fillStyle = gradient;

        this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2 - 20);

        //withtoto
        this.ctx.font = '20px Arial';
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.shadowBlur = 5;
        this.ctx.fillText('Press P to resume', this.canvas.width / 2, this.canvas.height / 2 + 40);

        this.ctx.restore();
    }

    update(deltaTime) {
        this.updatePlayer(deltaTime);
        this.updateBullets(deltaTime);
        this.updateInvaders(deltaTime);
        this.updateParticles(deltaTime);

        //Boss system
        if (this.bossActive && this.bossSystemV2) {
            this.bossSystemV2.update(deltaTime);
        }

        //Boost system
        if (window.boostManager) {
            window.boostManager.update(deltaTime);
        }
        if (window.boostEffects) {
            //yes but in in withtoyes (deltatime / 60, .to. deltatime butfromin to 60 FPS)
            window.boostEffects.update(deltaTime / 60);
        }

        //Check collisions
        this.checkCollisions();

        //Check level completion
        this.checkLevelCompletion();
    }

    render() {
        //Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        //Draw game objects
        this.drawPlayer();

        //Ricochet shield effect (with in player)
        if (window.boostEffects && window.boostEffects.renderRicochetShield) {
            window.boostEffects.renderRicochetShield(this.ctx, this.player);
        }

        //Gravity Well effect (with on background)
        if (window.boostEffects && window.boostEffects.renderGravityWellEffect) {
            window.boostEffects.renderGravityWellEffect(this.ctx);
        }

        this.drawInvaders();
        this.drawBullets();
        this.drawParticles();
        this.drawRipples();
        this.drawHealEffects();

        //Boss system
        if (this.bossActive && this.bossSystemV2) {
            this.bossSystemV2.render(this.ctx);
        }

        //Boost system
        if (window.boostManager) {
            window.boostManager.render(this.ctx);
        }
        if (window.boostEffects) {
            window.boostEffects.render(this.ctx);
        }

        //UI
        this.drawUI();
        this.updateDOMUI(); //Updating DOM elementin (scoreandtoand)
    }

    //Update methods
    updatePlayer(deltaTime) {
        const playerSpeed = this.player.speed;
        const moveSpeed = playerSpeed * deltaTime;

        //Keyboard controls
        if (this.keys['ArrowLeft'] && this.player.x > 0) {
            this.player.x -= moveSpeed;
        }
        if (this.keys['ArrowRight'] && this.player.x < this.canvas.width - this.player.width) {
            this.player.x += moveSpeed;
        }
        if (this.keys[' '] || this.keys['Space']) {
            this.createBullet();
        }

        //touch controls - to frombut and
        if (this.touchData.active && this.touchData.touchingPlayer) {
            //and player on andandand (with withand)
            const targetX = this.touchData.currentX - this.touchData.offsetX - this.player.width / 2;
            this.player.x = Math.max(0, Math.min(targetX, this.canvas.width - this.player.width));
        }
    }

    updateBullets(deltaTime) {
        //at Auto-Target effect to bullets player Updating andand
        if (window.boostEffects && window.boostManager && window.boostManager.isBoostActive('AUTO_TARGET')) {
            const enemies = this.invaders.filter(inv => inv.alive);
            if (this.bossActive && this.bossSystemV2 && this.bossSystemV2.currentBoss) {
                enemies.push(this.bossSystemV2.currentBoss);
            }

            for (const bullet of this.bullets) {
                window.boostEffects.applyAutoTargetEffect(bullet, enemies);
            }
        }

        //Player bullets
        this.bullets = this.bullets.filter(bullet => {
            if (!bullet.trail) bullet.trail = [];

            if (bullet.vy !== undefined) {
                bullet.y += bullet.vy * deltaTime;
            } else {
                bullet.y -= bullet.speed * deltaTime;
            }

            if (bullet.vx !== undefined) {
                bullet.x += bullet.vx * deltaTime;
            }

            bullet.trail.push({x: bullet.x + bullet.width/2, y: bullet.y + bullet.height});
            if (bullet.trail.length > PERFORMANCE_SETTINGS.trailLength) bullet.trail.shift();

            if (bullet.y <= -bullet.height) {
                delete bullet.autoTargeted;
                delete bullet.originalVx;
                delete bullet.originalVy;
                if (this.performanceOptimizer) {
                    this.performanceOptimizer.returnToPool('playerBullets', bullet);
                }
                return false;
            }
            return true;
        });

        //Boost effects on invader bullets
        if (window.boostEffects && window.boostManager) {
            if (window.boostManager.isBoostActive('RICOCHET') && window.player) {
                window.boostEffects.applyRicochetEffect(this.invaderBullets, window.player);
            }

            if (window.boostManager.isBoostActive('GRAVITY_WELL')) {
                window.boostEffects.applyGravityWellEffect(this.invaderBullets);
            } else {
                for (const bullet of this.invaderBullets) {
                    if (bullet.vx !== undefined || bullet.vy !== undefined || bullet.absorbed) {
                        delete bullet.vx;
                        delete bullet.vy;
                        delete bullet.absorbed;
                        bullet.speed = bullet.speed || 2;
                        bullet.wobble = bullet.wobble || 0;
                    }
                }
            }
        }

        //Invader bullets
        this.invaderBullets = this.invaderBullets.filter(bullet => {
            if (bullet.absorbed) {
                delete bullet.color;
                delete bullet.ricochet;
                delete bullet.autoTargeted;
                delete bullet.originalVx;
                delete bullet.originalVy;
                if (this.performanceOptimizer) {
                    this.performanceOptimizer.returnToPool('crabBullets', bullet);
                }
                return false;
            }

            if (bullet.justCreated && bullet.creationTime && Date.now() - bullet.creationTime > 100) {
                bullet.justCreated = false;
            }

            if (bullet.vx !== undefined && bullet.vy !== undefined) {
                bullet.x += bullet.vx * deltaTime;
                bullet.y += bullet.vy * deltaTime;
            } else {
                bullet.y += bullet.speed * deltaTime;
                bullet.wobble += 0.2 * deltaTime;
                bullet.x += Math.sin(bullet.wobble) * 0.5 * deltaTime;
            }

            if (bullet.y >= this.canvas.height) {
                delete bullet.color;
                delete bullet.ricochet;
                delete bullet.autoTargeted;
                delete bullet.originalVx;
                delete bullet.originalVy;
                if (this.performanceOptimizer) {
                    this.performanceOptimizer.returnToPool('crabBullets', bullet);
                }
                return false;
            }
            return true;
        });

        //Ricochet bullets hitting invaders
        if (window.boostManager && window.boostManager.isBoostActive('RICOCHET')) {
            for (let i = this.invaderBullets.length - 1; i >= 0; i--) {
                const bullet = this.invaderBullets[i];
                if (bullet.ricochet) {
                    let bulletHit = false;

                    for (let j = 0; j < this.invaders.length && !bulletHit; j++) {
                        if (this.invaders[j].alive &&
                            broadPhaseCollisionCheck(bullet, this.invaders[j]) &&
                            fastCollisionCheck(bullet, this.invaders[j])) {

                            bulletHit = true;

                            let crabColor = this.getCrabColor(this.invaders[j].type);
                            this.createExplosion(this.invaders[j].x + this.invaders[j].width/2,
                                              this.invaders[j].y + this.invaders[j].height/2, crabColor);

                            this.createRipple(this.invaders[j].x + this.invaders[j].width/2,
                                           this.invaders[j].y + this.invaders[j].height/2);

                            const points = this.getInvaderScore(this.invaders[j].row);

                            if (window.destroyInvader) {
                                window.destroyInvader(this.invaders[j], j, this);
                            } else {
                                this.score += points;
                                window.score = this.score;

                                if (window.easterEggManager) {
                                    window.easterEggManager.onScoreUpdate(this.score);
                                }
                            }

                            this.invaders[j].alive = false;
                            this.invaders[j].destroyed = true;

                            //Sound
                            if (window.soundManager) {
                                window.soundManager.playSound('crabDeath', 0.3);
                            }

                            delete bullet.color;
                            delete bullet.ricochet;
                            if (this.performanceOptimizer) {
                                this.performanceOptimizer.returnToPool('crabBullets', bullet);
                            }
                            this.invaderBullets.splice(i, 1);
                            break;
                        }
                    }
                }
            }
        }

        //Spatial grid optimization
        if (this.performanceOptimizer && (this.bullets.length > 10 || this.invaderBullets.length > 10)) {
            const allObjects = [...this.bullets, ...this.invaderBullets, ...this.invaders.filter(inv => inv.alive), this.player];
            this.performanceOptimizer.updateSpatialGrid(allObjects);
        }
    }

    updateInvaders(deltaTime) {
        let shouldDrop = false;
        let aliveInvaders = this.invaders.filter(inv => inv.alive);

        const killMultiplier = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.CRAB_SPEED_KILL_MULTIPLIER)
            ? GAME_CONFIG.CRAB_SPEED_KILL_MULTIPLIER
            : 0.00125;

        const totalInvaders = this.invaderRows * this.invaderCols;
        const speedMultiplier = 1 + (totalInvaders - aliveInvaders.length) * killMultiplier;

        const crabSpeedModifier = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.CRAB_SPEED)
            ? GAME_CONFIG.CRAB_SPEED / 100
            : 1;

        let speedTamerMultiplier = 1;
        if (window.boostManager && window.boostManager.speedTamerStacks > 0 && window.BOOST_CONSTANTS) {
            const reduction = window.boostManager.speedTamerStacks * window.BOOST_CONSTANTS.EFFECTS.SPEED_TAMER.reduction;
            speedTamerMultiplier = Math.max(0.1, 1 - reduction);
        }

        for (let invader of aliveInvaders) {
            if ((invader.x <= 0 && this.invaderDirection === -1) ||
                (invader.x >= this.canvas.width - invader.width && this.invaderDirection === 1)) {
                shouldDrop = true;
                break;
            }
        }

        if (shouldDrop) {
            this.invaderDirection *= -1;
            window.invaderDirection = this.invaderDirection;

            for (let invader of this.invaders) {
                if (invader.alive) {
                    invader.y += this.invaderDropDistance;
                }
            }
        }

        this.moveInvaders(speedMultiplier, crabSpeedModifier);

        for (let invader of this.invaders) {
            if (invader.alive) {
                this.createInvaderBullet(invader);
            }
        }

        for (let invader of aliveInvaders) {
            if (invader.y + invader.height >= this.player.y) {
                //NOTbut Clearing boss
                this.bossActive = false;
                if (this.bossSystemV2) {
                    this.bossSystemV2.clearBoss();
                }

                //inin handleGameOver if withwithin (for RegularGame), else with state
                if (this.handleGameOver && typeof this.handleGameOver === 'function') {
                    this.handleGameOver();
                } else {
                    this.gameState = 'gameOver';
                }
                break;
            }
        }
    }

    updateParticles(deltaTime) {
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx * deltaTime;
            particle.y += particle.vy * deltaTime;

            //for toinin - at inandand
            if (particle.isBlood && particle.gravity) {
                particle.vy += particle.gravity * deltaTime;
            } else {
                particle.vy += 0.2 * deltaTime;
            }

            particle.life -= deltaTime;
            return particle.life > 0;
        });

        this.ripples = this.ripples.filter(ripple => {
            ripple.size = (ripple.maxSize * (30 - ripple.life)) / 30;
            ripple.life -= deltaTime;
            return ripple.life > 0;
        });

        this.healEffects = this.healEffects.filter(effect => {
            effect.wobbleTime += deltaTime;
            effect.life -= deltaTime;
            effect.y = effect.startY - (effect.maxLife - effect.life) * 2;
            effect.x += Math.sin(effect.wobbleTime * 0.01) * 0.5;
            effect.alpha = Math.max(0, effect.life / effect.maxLife);
            return effect.life > 0;
        });
    }

    checkCollisions() {
        //Boss system collisions
        if (this.bossActive && this.bossSystemV2) {
            const bossCollision = this.bossSystemV2.checkCollisionWithPlayerBullets(this.bullets);

            for (let i = bossCollision.bulletsToRemove.length - 1; i >= 0; i--) {
                this.bullets.splice(bossCollision.bulletsToRemove[i], 1);
            }

            if (bossCollision.result.killed) {
                this.score += bossCollision.result.score;
                window.score = this.score;

                if (window.easterEggManager) {
                    window.easterEggManager.onScoreUpdate(this.score);
                }

                if (bossCollision.result.healAmount) {
                    const oldLives = this.lives;
                    this.lives = Math.min(this.lives + bossCollision.result.healAmount, MAX_LIVES);

                    const boss = this.bossSystemV2.getCurrentBoss();
                    if (boss) {
                        const centerX = boss.x + boss.width / 2;
                        const centerY = boss.y + boss.height / 2;
                        this.createHealEffect(centerX, centerY, bossCollision.result.healAmount);
                    }
                }

                const boss = this.bossSystemV2.getCurrentBoss();
                if (boss && window.createSpecificBoost) {
                    const centerX = boss.x + boss.width / 2;
                    const centerY = boss.y + boss.height / 2;
                    window.createSpecificBoost(centerX, centerY, 'RANDOM_CHAOS');
                }

                this.bossActive = false;

                if (window.easterEggManager) {
                    window.easterEggManager.onBossDefeated();
                }
            }

            const playerHit = this.bossSystemV2.checkCollisionWithPlayer(this.player);
            if (playerHit) {
                this.createExplosion(this.player.x + this.player.width/2, this.player.y + this.player.height/2, '#6666ff', true);
                if (this.damagePlayer(1)) {
                    return;
                }
            }
        }

        if (!this.bossActive) {
            const bulletsToRemove = [];
            const invadersToRemove = [];

            for (let i = 0; i < this.bullets.length; i++) {
                let bulletHit = false;

                for (let j = 0; j < this.invaders.length && (!bulletHit || this.bullets[i].piercing); j++) {
                    if (this.invaders[j].alive &&
                        broadPhaseCollisionCheck(this.bullets[i], this.invaders[j]) &&
                        fastCollisionCheck(this.bullets[i], this.invaders[j])) {

                        if (!this.bullets[i].piercing) {
                            bulletHit = true;
                        }

                        let crabColor = this.getCrabColor(this.invaders[j].type);
                        this.createExplosion(this.invaders[j].x + this.invaders[j].width/2,
                                          this.invaders[j].y + this.invaders[j].height/2, crabColor);

                        this.createRipple(this.invaders[j].x + this.invaders[j].width/2,
                                       this.invaders[j].y + this.invaders[j].height/2);

                        const points = this.getInvaderScore(this.invaders[j].row);

                        if (window.destroyInvader) {
                            window.destroyInvader(this.invaders[j], j, this);
                        } else {
                            this.score += points;
                            window.score = this.score;

                            if (window.easterEggManager) {
                                window.easterEggManager.onScoreUpdate(this.score);
                            }

                            if (window.tryCreateBoost) {
                                window.tryCreateBoost(
                                    this.invaders[j].x + this.invaders[j].width / 2,
                                    this.invaders[j].y + this.invaders[j].height / 2
                                );
                            }
                        }

                        this.invaders[j].alive = false;

                        //Sound
                        if (window.soundManager) {
                            window.soundManager.playSound('crabDeath', 0.3);
                        }

                        if (!this.bullets[i].piercing) {
                            bulletsToRemove.push(i);
                        }
                        invadersToRemove.push(j);

                        this.logGameEvent('crab_killed', {
                            crabType: this.invaders[j].type,
                            points: points,
                            position: {x: this.invaders[j].x, y: this.invaders[j].y}
                        });
                    }
                }
            }

            bulletsToRemove.sort((a, b) => b - a);
            for (let i of bulletsToRemove) {
                const bullet = this.bullets[i];
                delete bullet.autoTargeted;
                delete bullet.originalVx;
                delete bullet.originalVy;
                if (this.performanceOptimizer) {
                    this.performanceOptimizer.returnToPool('playerBullets', bullet);
                }
                this.bullets.splice(i, 1);
            }
        }

        if (!this.bossActive) {
            for (let i = this.invaderBullets.length - 1; i >= 0; i--) {
                if (this.invaderBullets[i].x < this.player.x + this.player.width &&
                    this.invaderBullets[i].x + this.invaderBullets[i].width > this.player.x &&
                    this.invaderBullets[i].y < this.player.y + this.player.height &&
                    this.invaderBullets[i].y + this.invaderBullets[i].height > this.player.y) {

                    this.createExplosion(this.player.x + this.player.width/2, this.player.y + this.player.height/2, '#6666ff', true);
                    const bullet = this.invaderBullets[i];
                    if (this.performanceOptimizer) {
                        this.performanceOptimizer.returnToPool('crabBullets', bullet);
                    }
                    this.invaderBullets.splice(i, 1);

                    this.damagePlayer(1);
                }
            }
        }
    }

    checkLevelCompletion() {
        //Check inand in
        let aliveInvaders = this.invaders.filter(inv => inv.alive);
        const canStartNextLevel = !window.boostManager || window.boostManager.canStartNextLevel();

        if (aliveInvaders.length === 0 && !this.bossActive && !this.levelTransitionActive && canStartNextLevel) {
            this.levelTransitionActive = true;

            createSafeTimeout(() => {
                const nextLevel = this.level + 1;

                if (window.boostManager) {
                    window.boostManager.clearForNewLevel();
                }

                //Checking, inwith and next level boss
                const isBossLevel = this.bossSystemV2 ? this.bossSystemV2.isBossLevel(nextLevel) : false;

                //NOT inandandin speed on in with bossand (3, 6, 9, 12, 15)
                if (!isBossLevel) {
                    const gameSpeedIncrease = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.GAME_SPEED_LEVEL_INCREASE)
                        ? GAME_CONFIG.GAME_SPEED_LEVEL_INCREASE
                        : 0.07;

                    const invaderSpeedIncrease = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.CRAB_SPEED_LEVEL_INCREASE)
                        ? GAME_CONFIG.CRAB_SPEED_LEVEL_INCREASE
                        : 0.25;

                    this.gameSpeed += gameSpeedIncrease;
                    this.invaderSpeed += invaderSpeedIncrease;
                }

                if (this.bossSystemV2) {

                    if (isBossLevel) {
                        this.level = nextLevel;
                        window.level = this.level; //Updating window.level for and UI totoin
                        this.updateDOMUI(); // CRITICAL: refresh the UI after the level changes
                        this.initLevelScoring();

                        const boss = this.bossSystemV2.createBoss(this.level);

                        if (boss) {
                            this.bossActive = true;
                        } else {
                            console.error(' Cannot create boss: initialization failed');
                            this.createInvaders();
                            this.level = nextLevel;
                            window.level = this.level; //Updating window.level for and UI totoin
                            this.updateDOMUI(); // CRITICAL: refresh the UI after the level changes
                        }
                    } else {
                        this.level = nextLevel;
                        window.level = this.level; //Updating window.level for and UI totoin
                        this.updateDOMUI(); // CRITICAL: refresh the UI after the level changes
                        this.initLevelScoring();
                        this.createInvaders();
                    }
                } else {
                    console.error(' bossSystemV2 is null! Creating regular invaders instead.');
                    this.level = nextLevel;
                    window.level = this.level; //Updating window.level for and UI totoin
                    this.updateDOMUI(); // CRITICAL: refresh the UI after the level changes
                    this.initLevelScoring();
                    this.createInvaders();
                }

                this.levelTransitionActive = false;
            }, 2000);
        }
    }

    drawPlayer() {
        const centerX = this.player.x + this.player.width / 2;
        const centerY = this.player.y + this.player.height / 2;

        if (this.images.player.loaded.front && this.images.player.front && this.images.player.front.complete) {
            setPlayerShadow(this.ctx);

            let currentImage = this.images.player.front;
            let currentImageKey = 'front';

            if (this.playerIsHurt && this.images.player.loaded.ouch && this.images.player.ouch && this.images.player.ouch.complete) {
                currentImage = this.images.player.ouch;
                currentImageKey = 'ouch';
            }
            else if (this.keys['ArrowLeft'] && this.images.player.loaded.left && this.images.player.left && this.images.player.left.complete) {
                currentImage = this.images.player.left;
                currentImageKey = 'left';
            }
            else if (this.keys['ArrowRight'] && this.images.player.loaded.right && this.images.player.right && this.images.player.right.complete) {
                currentImage = this.images.player.right;
                currentImageKey = 'right';
            }

            //inandbut fromwithandinbut fromand, if towithbut
            const scaledImage = this.images.playerScaledCache[currentImageKey];
            let drawWidth, drawHeight;

            if (scaledImage) {
                //for inandbut fromwithandinbut fromand ondirect
                currentImage = scaledImage;
                drawWidth = scaledImage.width;
                drawHeight = scaledImage.height;
            } else {
                //for andandon fromand in
                const imgWidth = currentImage.naturalWidth || currentImage.width;
                const imgHeight = currentImage.naturalHeight || currentImage.height;

                // octopiFront.png (2310x2209) -> 102.48 x 98 (+40%)
                if (imgWidth === 2310 && imgHeight === 2209) {
                    drawWidth = 102.48;
                    drawHeight = 98;
                }
                // OctopiLeft.png / octopiRight.png (2247x2227) -> 98.88 x 98 (+40%)
                else if (imgWidth === 2247 && imgHeight === 2227) {
                    drawWidth = 98.88;
                    drawHeight = 98;
                }
                // OctopiOoff.png (2823x2312) -> 125.24 x 102.58 (+40%)
                else if (imgWidth === 2823 && imgHeight === 2312) {
                    drawWidth = 125.24;
                    drawHeight = 102.58;
                }
                //Fallback for and fromand (old and)
                else {
                    const maxSize = 98;
                    const aspectRatio = imgWidth / imgHeight;
                    if (aspectRatio > 1) {
                        drawWidth = maxSize;
                        drawHeight = maxSize / aspectRatio;
                    } else {
                        drawHeight = maxSize;
                        drawWidth = maxSize * aspectRatio;
                    }
                }
            }

            //Invincibility glow
            if (window.boostManager && window.boostManager.isBoostActive('INVINCIBILITY')) {
                const time = Date.now() * 0.01;
                const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#0000ff', '#8800ff'];
                const colorIndex = Math.floor(time) % colors.length;

                this.ctx.save();

                const glowRadius = Math.max(drawWidth, drawHeight) / 2;
                const gradient = this.ctx.createRadialGradient(centerX, centerY, glowRadius/2, centerX, centerY, glowRadius + 15);
                gradient.addColorStop(0, colors[colorIndex] + '80');
                gradient.addColorStop(0.7, colors[colorIndex] + '40');
                gradient.addColorStop(1, colors[colorIndex] + '00');

                this.ctx.fillStyle = gradient;
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 2);

                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, glowRadius + 15, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.restore();

                if (Math.random() < 0.05 && window.boostEffects) {
                    const sparkleColors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#0000ff', '#8800ff', '#ffffff'];
                    const sparkleColor = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];

                    window.boostEffects.createParticle({
                        x: centerX + (Math.random() - 0.5) * drawWidth,
                        y: centerY + (Math.random() - 0.5) * drawHeight,
                        color: sparkleColor,
                        size: 2 + Math.random() * 3,
                        life: 0.8 + Math.random() * 0.4,  //0.8-1.2 seconds (was 800-1200 with)
                        vx: (Math.random() - 0.5) * 180,  //px/s (was 3 px/frame → 180 px/s at 60 FPS)
                        vy: (Math.random() - 0.5) * 180  //px/s (was 3 px/frame → 180 px/s at 60 FPS)
                    });
                }
            }

            //fromto withandinand for inandbut fromwithandin fromand (to toandto)
            this.ctx.imageSmoothingEnabled = false;

            this.ctx.drawImage(
                currentImage,
                centerX - drawWidth / 2,
                centerY - drawHeight / 2,
                drawWidth,
                drawHeight
            );

            clearShadow(this.ctx);

            //Shield Barrier
            if (window.boostManager && window.boostManager.isBoostActive('SHIELD_BARRIER')) {
                const boost = window.boostManager.getActiveBoost('SHIELD_BARRIER');
                const hitsBlocked = boost ? boost.hitsBlocked : 0;
                const maxHits = window.BOOST_CONSTANTS ? window.BOOST_CONSTANTS.EFFECTS.SHIELD_BARRIER.hits : 3;

                let shieldColor = '#00ddff';
                if (hitsBlocked >= maxHits - 1) {
                    shieldColor = '#ff4444';
                } else if (hitsBlocked >= maxHits - 2) {
                    shieldColor = '#ffaa44';
                }

                this.ctx.strokeStyle = shieldColor;
                this.ctx.lineWidth = 3;
                this.ctx.globalAlpha = 0.8;
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;

                const pulseAlpha = 0.3 + 0.2 * Math.sin(Date.now() * 0.01);
                this.ctx.fillStyle = shieldColor;
                this.ctx.globalAlpha = pulseAlpha;
                this.ctx.beginPath();
                this.ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
            }

        } else {
            this.ctx.fillStyle = '#00ddff';
            this.ctx.font = '50px Arial';
            this.ctx.fillText('', this.player.x, this.player.y + 40);
        }
    }

    drawInvaders() {
        if (this.performanceOptimizer && this.invaders.length > 20) {
            const aliveInvaders = this.invaders.filter(inv => inv.alive).map(invader => ({
                ...invader,
                active: true,
                imageKey: invader.type,
                centerX: invader.x + invader.width / 2,
                centerY: invader.y + invader.height / 2,
                bobbing: Math.sin(invader.animFrame) * 2
            }));

            const imageMap = new Map();
            Object.keys(this.images.crabs).forEach(type => {
                if (this.images.crabsLoaded[type]) {
                    //CRITICAL FIX: Use ORIGINAL Image objects, NOT Canvas from cache!
                    //Performance optimizer expects Image objects with .complete, .naturalWidth, .src
                    //Canvas elements don't have these properties
                    const img = this.images.crabs[type];
                    imageMap.set(type, img);
                }
            });

            if (this.performanceOptimizer) {
                this.performanceOptimizer.renderBatch(this.ctx, aliveInvaders, imageMap);
            }
        } else {
            for (let invader of this.invaders) {
                if (invader.alive) {
                    const centerX = invader.x + invader.width / 2;
                    const centerY = invader.y + invader.height / 2;
                    const bobbing = Math.sin(invader.animFrame) * 2;

                    if (this.images.crabsLoaded[invader.type] && this.images.crabs[invader.type] && this.images.crabs[invader.type].complete) {
                        setCrabShadow(this.ctx, this.getCrabColor(invader.type));

                        //inandbut fromwithandinbut fromand, if towithbut
                        const scaledCrab = this.images.crabsScaledCache[invader.type];
                        let img, drawWidth, drawHeight;

                        if (scaledCrab) {
                            //for inandbut fromwithandinbut fromand ondirect
                            img = scaledCrab;
                            drawWidth = scaledCrab.width;
                            drawHeight = scaledCrab.height;
                        } else {
                            //for andandon fromand in
                            img = this.images.crabs[invader.type];
                            const maxSize = 60; // Increased from 40 to 60 (1.5x)
                            const aspectRatio = img.naturalWidth / img.naturalHeight;

                            if (aspectRatio > 1) {
                                drawWidth = maxSize;
                                drawHeight = maxSize / aspectRatio;
                            } else {
                                drawHeight = maxSize;
                                drawWidth = maxSize * aspectRatio;
                            }
                        }

                        //fromto withandinand for towithand
                        this.ctx.imageSmoothingEnabled = false;

                        this.ctx.drawImage(img,
                                         centerX - drawWidth/2,
                                         centerY - drawHeight/2 + bobbing,
                                         drawWidth, drawHeight);

                    } else {
                        this.ctx.font = '25px Arial';
                        this.ctx.fillText('', invader.x, invader.y + 20 + bobbing);
                    }
                }
            }

            clearShadow(this.ctx);
        }
    }

    drawBullets() {
        for (let bullet of this.bullets) {
            this.ctx.strokeStyle = 'rgba(102, 102, 255, 0.6)';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            for (let i = 0; i < bullet.trail.length - 1; i++) {
                const alpha = i / bullet.trail.length;
                this.ctx.globalAlpha = alpha * 0.8;
                if (i < bullet.trail.length - 1) {
                    this.ctx.moveTo(bullet.trail[i].x, bullet.trail[i].y);
                    this.ctx.lineTo(bullet.trail[i + 1].x, bullet.trail[i + 1].y);
                }
            }
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;

            //with in fromand bullets, if but
            const bulletImage = window.preloadManager && window.preloadManager.getImage ?
                window.preloadManager.getImage('bullet') : null;

            if (bulletImage && bulletImage.complete) {
                //Draw fromand bullets
                const imgSize = 14; //fromand bullets (but on 30% with 20)
                this.ctx.save();

                if (PERFORMANCE_SETTINGS.glowEnabled) {
                    this.ctx.shadowColor = bullet.color || '#6666ff';
                    this.ctx.shadowBlur = 10;
                }

                this.ctx.drawImage(
                    bulletImage,
                    bullet.x + bullet.width/2 - imgSize/2,
                    bullet.y + bullet.height/2 - imgSize/2,
                    imgSize,
                    imgSize
                );

                if (PERFORMANCE_SETTINGS.glowEnabled) {
                    this.ctx.shadowBlur = 0;
                }

                this.ctx.restore();
            } else {
                //Fallback on toand if fromand NOT but
                const bulletColor = bullet.color || '#6666ff';
                const bulletLightColor = bullet.color ? bullet.color : '#aaaaff';

                this.ctx.fillStyle = bulletColor;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x + bullet.width/2, bullet.y + bullet.height/2, 4, 0, Math.PI * 2);
                this.ctx.fill();

                if (PERFORMANCE_SETTINGS.glowEnabled) {
                    this.ctx.shadowColor = bulletColor;
                    this.ctx.shadowBlur = 10;
                }
                this.ctx.fillStyle = bulletLightColor;
                this.ctx.beginPath();
                this.ctx.arc(bullet.x + bullet.width/2, bullet.y + bullet.height/2, 2, 0, Math.PI * 2);
                this.ctx.fill();
                if (PERFORMANCE_SETTINGS.glowEnabled) {
                    this.ctx.shadowBlur = 0;
                }
            }
        }

        for (let bullet of this.invaderBullets) {
            const bulletColor = bullet.color || '#ff4444';
            let bulletFillColor;
            if (bullet.color === '#0088ff') {
                bulletFillColor = 'rgba(0, 136, 255, 0.3)';
            } else {
                bulletFillColor = 'rgba(255, 68, 68, 0.3)';
            }

            this.ctx.strokeStyle = bulletColor;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(bullet.x + bullet.width/2, bullet.y + bullet.height/2, bullet.width/2, 0, Math.PI * 2);
            this.ctx.stroke();

            this.ctx.fillStyle = bulletFillColor;
            this.ctx.beginPath();
            this.ctx.arc(bullet.x + bullet.width/2, bullet.y + bullet.height/2, bullet.width/2 - 1, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    drawParticles() {
        for (let particle of this.particles) {
            let alpha = particle.life / particle.maxLife;
            this.ctx.fillStyle = particle.color;
            this.ctx.globalAlpha = alpha;

            //for toinin - to inwith to
            if (particle.isBlood) {
                this.ctx.save();
                this.ctx.translate(particle.x, particle.y);

                //form toand toinand
                this.ctx.beginPath();
                this.ctx.arc(0, 0, particle.size * 0.8, 0, Math.PI * 2);
                this.ctx.fill();

                //inwith toand (if and FAST)
                const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
                if (speed > 5) {
                    const angle = Math.atan2(particle.vy, particle.vx);
                    this.ctx.rotate(angle);
                    this.ctx.fillRect(-particle.size * 1.5, -particle.size * 0.3, particle.size * 1.5, particle.size * 0.6);
                }

                this.ctx.restore();
            } else {
                //particle
                this.ctx.beginPath();
                this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                this.ctx.fill();
            }

            this.ctx.globalAlpha = 1;
        }
    }

    drawRipples() {
        for (let ripple of this.ripples) {
            if (ripple.size <= 0) continue;

            this.ctx.strokeStyle = `rgba(0, 221, 255, ${ripple.life / 30})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ripple.x, ripple.y, ripple.size, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    drawHealEffects() {
        this.ctx.save();
        for (let effect of this.healEffects) {
            this.ctx.globalAlpha = effect.alpha;
            this.ctx.fillStyle = '#0099ff';
            this.ctx.font = 'bold 28px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;

            this.ctx.strokeText(effect.text, effect.x, effect.y);
            this.ctx.fillText(effect.text, effect.x, effect.y);
        }
        this.ctx.restore();
    }

    drawUI() {
        //fromininwith renderPauseScreen() in gameLoop
        //from to no longer NOT useswith, but within for withinwithandwithand

        if (this.levelTransitionActive) {
            // Darken the background (stronger)
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.save();
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // "LEVEL COMPLETE!" title (sized for 720px)
            this.ctx.font = 'bold 60px Arial';

            // Shadow for readability
            this.ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            this.ctx.shadowBlur = 15;
            this.ctx.shadowOffsetX = 4;
            this.ctx.shadowOffsetY = 4;

            // Outline for contrast
            this.ctx.strokeStyle = '#003322';
            this.ctx.lineWidth = 4;
            this.ctx.strokeText('LEVEL COMPLETE!', this.canvas.width/2, this.canvas.height/2 - 40);

            // Main text
            this.ctx.fillStyle = '#00ff88';
            this.ctx.fillText('LEVEL COMPLETE!', this.canvas.width/2, this.canvas.height/2 - 40);

            // Subtitle
            this.ctx.font = 'bold 30px Arial';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowOffsetX = 3;
            this.ctx.shadowOffsetY = 3;

            this.ctx.strokeStyle = '#001111';
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(`Preparing Level ${this.level + 1}...`, this.canvas.width/2, this.canvas.height/2 + 50);

            this.ctx.fillStyle = '#88ffcc';
            this.ctx.fillText(`Preparing Level ${this.level + 1}...`, this.canvas.width/2, this.canvas.height/2 + 50);

            this.ctx.restore();
        }
    }

    /**
     * Updating DOM elementin UI (scoreandto toin, points, level)
     */
    updateDOMUI() {
        //Desktop UI
        const scoreEl = document.getElementById('score');
        const livesEl = document.getElementById('lives');
        const levelEl = document.getElementById('level');

        if (scoreEl) scoreEl.textContent = this.score;

        // Show lives as hearts
        if (livesEl) {
            if (this.lives <= 5) {
                // Draw each heart separately
                livesEl.textContent = '❤️'.repeat(Math.max(0, this.lives));
            } else {
                // Show the count with an icon
                livesEl.textContent = this.lives + 'x❤️';
            }
        }

        if (levelEl) levelEl.textContent = this.level;

        //Mobile UI
        const mobileScoreEl = document.getElementById('mobileScore');
        const mobileLivesEl = document.getElementById('mobileLives');
        const mobileLevelEl = document.getElementById('mobileLevel');

        if (mobileScoreEl) mobileScoreEl.textContent = this.score;

        // Show lives as hearts (mobile layout)
        if (mobileLivesEl) {
            if (this.lives <= 5) {
                mobileLivesEl.textContent = '❤️'.repeat(Math.max(0, this.lives));
            } else {
                mobileLivesEl.textContent = this.lives + 'x❤️';
            }
        }

        if (mobileLevelEl) mobileLevelEl.textContent = this.level;

        //CRITICAL: Call React callbacks to update state
        if (this.onScoreUpdate && typeof this.onScoreUpdate === 'function') {
            this.onScoreUpdate(this.score);
        }
        if (this.onLivesUpdate && typeof this.onLivesUpdate === 'function') {
            this.onLivesUpdate(this.lives);
        }
        if (this.onLevelUpdate && typeof this.onLevelUpdate === 'function') {
            this.onLevelUpdate(this.level);
        }
    }

    createInvaders() {
        this.invaders = [];
        const startX = 71;   // Original value
        const startY = 80;
        const spacingX = 74;  // Original value (enemies overlap visually)
        const spacingY = 61;   // Original value (enemies overlap visually)

        for (let row = 0; row < this.invaderRows; row++) {
            for (let col = 0; col < this.invaderCols; col++) {
                let crabType = 'Green';
                if (row === 0) crabType = 'Violet';
                else if (row === 1) crabType = 'Red';
                else if (row === 2) crabType = 'Yellow';
                else if (row === 3) crabType = 'Blue';
                else if (row === 4) crabType = 'Green';

                this.invaders.push({
                    x: startX + col * spacingX,
                    y: startY + row * spacingY,
                    width: this.invaderWidth,
                    height: this.invaderHeight,
                    alive: true,
                    type: crabType,
                    row: row,
                    animFrame: 0,
                    clawOffset: Math.random() * Math.PI * 2
                });
            }
        }

        //into easterEggManager
        if (this.easterEggManager) {
            this.easterEggManager.setTotalMobsInRound(this.invaders.length);
        }
    }

    createBullet() {
        const currentTime = Date.now();

        //RAPID FIRE BOOST: cooldown in 2
        let effectiveCooldown = this.shotCooldown;
        if (window.boostManager && window.boostManager.isBoostActive('RAPID_FIRE')) {
            const multiplier = window.BOOST_CONSTANTS?.EFFECTS?.RAPID_FIRE?.multiplier || 2;
            effectiveCooldown = this.shotCooldown / multiplier;
        }

        if (currentTime - this.lastShotTime < effectiveCooldown) return;

        this.lastShotTime = currentTime;

        //MULTI-SHOT BOOST: Creating 3 bullets
        if (window.boostManager && window.boostManager.isBoostActive('MULTI_SHOT')) {
            const centerX = this.player.x + this.player.width / 2;
            const centerY = this.player.y;

            //Getting bullets from boost-effects
            let bulletTemplates;
            if (window.boostEffects && window.boostEffects.getMultiShotBullets) {
                bulletTemplates = window.boostEffects.getMultiShotBullets(centerX, centerY);
            } else {
                //Fallback if boostEffects NOT towith
                bulletTemplates = [
                    { x: centerX, y: centerY, vx: -1.5, vy: -8, color: '#ff4444' },  //in
                    { x: centerX, y: centerY, vx: 0, vy: -8, color: '#ff4444' },     //
                    { x: centerX, y: centerY, vx: 1.5, vy: -8, color: '#ff4444' }    //in
                ];
            }

            //Creating 3 bullets
            for (const template of bulletTemplates) {
                const bullet = {
                    x: template.x - 2.5,
                    y: template.y,
                    width: 5,
                    height: 15,
                    speed: 8,
                    vx: template.vx,
                    vy: template.vy,
                    color: template.color,
                    trail: [],
                    multiShot: true,
                    piercing: window.boostManager && window.boostManager.isBoostActive('PIERCING_BULLETS')
                };
                this.bullets.push(bullet);
            }

            //sound andfrom
            if (window.soundManager) {
                window.soundManager.playSound('multiShot', 0.6, 1.0 + Math.random() * 0.2);
            }
            return;
        }

        //from in bullets for boostin
        let bulletColor = '#6666ff'; //regular withandand
        if (window.boostManager) {
            if (window.boostManager.isBoostActive('PIERCING_BULLETS')) {
                bulletColor = '#ffffff'; //for PIERCING_BULLETS
            } else if (window.boostManager.isBoostActive('RAPID_FIRE')) {
                bulletColor = '#ffff00'; //for RAPID_FIRE
            }
        }

        const bullet = {
            x: this.player.x + this.player.width / 2 - 2.5,
            y: this.player.y,
            width: 5,
            height: 15,
            speed: 8,
            color: bulletColor,
            trail: [], //for withyes bullets
            piercing: window.boostManager && window.boostManager.isBoostActive('PIERCING_BULLETS')
        };

        this.bullets.push(bullet);

        //Sound
        if (window.soundManager) {
            window.soundManager.playSound('playerShoot', 0.3, 0.9 + Math.random() * 0.2);
        }
    }

    initLevelScoring() {
        this.levelStartTime = Date.now();
        this.currentScoreMultiplier = 1.0;
        this.pointsFreezetotalTime = 0; //withwith but inand for butin in
        this._pointsFreezeStartTime = null;
    }

    //Helper methods
    moveInvaders(speedMultiplier = 1, crabSpeedModifier = 1) {
        for (let invader of this.invaders) {
            if (invader.alive) {
                //SPEED TAMER: withbut and
                let speedTamerMultiplier = 1;
                if (window.boostManager && window.boostManager.speedTamerStacks > 0 && window.BOOST_CONSTANTS) {
                    const reduction = window.boostManager.speedTamerStacks * window.BOOST_CONSTANTS.EFFECTS.SPEED_TAMER.reduction;
                    speedTamerMultiplier = Math.max(0.1, 1 - reduction);
                }

                //ICE FREEZE: inbut and to 50%
                let iceFreezeMultiplier = 1;
                if (window.boostManager && window.boostManager.isBoostActive('ICE_FREEZE')) {
                    iceFreezeMultiplier = window.BOOST_CONSTANTS?.EFFECTS?.ICE_FREEZE?.slowdown || 0.5;
                }

                const currentSpeed = this.invaderSpeed * speedMultiplier * this.gameSpeed *
                                   crabSpeedModifier * speedTamerMultiplier * iceFreezeMultiplier * this.deltaTime;
                invader.x += currentSpeed * this.invaderDirection;
                invader.animFrame += 0.08 * this.deltaTime;
                invader.clawOffset += 0.12 * this.deltaTime;
            }
        }
    }

    damagePlayer(damage = 1) {
        //Checking Shield Barrier
        if (window.hasActiveShield && window.hasActiveShield()) {
            if (window.processShieldDamage && window.processShieldDamage()) {
                //damage toandin and
                return false; //damage toandin
            }
        }

        //Checking Invincibility
        if (window.isPlayerInvincible && window.isPlayerInvincible()) {
            return false; //damage toandin NOTinandwith
        }

        this.lives -= damage;
        window.lives = this.lives; //Updating window.lives for and UI totoin

        if (window.soundManager) {
            soundManager.playRandomHurtSound(0.6);
        }

        this.playerIsHurt = true;

        if (this.hurtTimeout) {
            clearTimeout(this.hurtTimeout);
        }

        this.hurtTimeout = setTimeout(() => {
            this.playerIsHurt = false;
            this.hurtTimeout = null;
        }, 500);

        if (this.lives <= 0) {
            //NOTbut Clearing boss at withand player
            this.bossActive = false;
            if (this.bossSystemV2) {
                this.bossSystemV2.clearBoss();
            }

            //inin handleGameOver if withwithin (for RegularGame), else with state
            if (this.handleGameOver && typeof this.handleGameOver === 'function') {
                this.handleGameOver();
            } else {
                this.gameState = 'gameOver';
            }
            return true;
        }

        return false;
    }

    createInvaderBullet(invader) {
        const baseFireRate = 0.0008 * Math.log(this.level + 1) * 0.85; // Reduced by 15%
        const adjustedFireRate = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.CRAB_FIRE_RATE)
            ? baseFireRate * (GAME_CONFIG.CRAB_FIRE_RATE / 100)
            : baseFireRate;

        if (Math.random() < adjustedFireRate) {
            const bulletSpeed = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.CRAB_BULLET_SPEED)
                ? 2.5 * (GAME_CONFIG.CRAB_BULLET_SPEED / 100)
                : 2.5;

            let bullet;
            if (this.performanceOptimizer) {
                bullet = this.performanceOptimizer.getPooledObject('crabBullets', {
                    x: invader.x + invader.width / 2 - 4,
                    y: invader.y + invader.height,
                    width: 8,
                    height: 8,
                    speed: bulletSpeed,
                    wobble: 0,
                    vy: bulletSpeed,
                    fromCrab: true
                });
                if (bullet) {
                    delete bullet.absorbed;
                    delete bullet.vx;
                    delete bullet.vy;
                    delete bullet.ricochet;
                    delete bullet.color;
                    delete bullet.autoTargeted;
                    delete bullet.originalVx;
                    delete bullet.originalVy;
                    bullet.justCreated = true;
                    bullet.creationTime = Date.now();
                }
            } else {
                bullet = {
                    x: invader.x + invader.width / 2 - 4,
                    y: invader.y + invader.height,
                    width: 8,
                    height: 8,
                    speed: bulletSpeed,
                    wobble: 0,
                    vy: bulletSpeed,
                    fromCrab: true,
                    justCreated: true,
                    creationTime: Date.now()
                };
            }

            if (bullet) {
                this.invaderBullets.push(bullet);
            }
        }
    }

    createExplosion(x, y, color, isOctopus = false) {
        //Checking to for effect toinand
        const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
        const isHalloween = currentTheme === 'halloween';

        const baseCount = isOctopus ? 15 : (isHalloween ? 20 : 12);
        const particleCount = Math.floor(baseCount * PERFORMANCE_SETTINGS.particleMultiplier);

        if (this.particles.length >= PERFORMANCE_SETTINGS.maxParticles) {
            return;
        }

        for (let i = 0; i < particleCount; i++) {
            //for and - and toinand
            if (isHalloween && !isOctopus) {
                this.particles.push({
                    x: x,
                    y: y,
                    vx: (Math.random() - 0.5) * 15, //with and
                    vy: (Math.random() - 0.5) * 15 - 2, //NOTbut inin
                    life: 50,
                    maxLife: 50,
                    color: i % 3 === 0 ? '#8B0000' : (i % 3 === 1 ? '#DC143C' : '#FF0000'), //fromtoand towithbut
                    size: Math.random() * 5 + 3, //no longer
                    isBlood: true, //to for toinin
                    gravity: 0.3 //inandand for and
                });
            } else {
                //particle for and
                this.particles.push({
                    x: x,
                    y: y,
                    vx: (Math.random() - 0.5) * 12,
                    vy: (Math.random() - 0.5) * 12,
                    life: 40,
                    maxLife: 40,
                    color: color,
                    size: Math.random() * 4 + 2,
                    isInk: isOctopus
                });
            }
        }
    }

    createRipple(x, y) {
        this.ripples.push({
            x: x,
            y: y,
            size: 0,
            maxSize: 50,
            life: 30
        });
    }

    createHealEffect(x, y, healAmount) {
        this.healEffects.push({
            x: x,
            y: y,
            startY: y,
            text: ` +${healAmount}`,
            life: 120,
            maxLife: 120,
            alpha: 1.0,
            wobbleTime: 0
        });
    }

    getCrabColor(type) {
        switch(type) {
            case 'Violet': return '#9966ff';
            case 'Red': return '#ff3333';
            case 'Yellow': return '#ffdd33';
            case 'Blue': return '#3366ff';
            case 'Green': return '#33cc66';
            //Fallback for lowercase (withinwithandwith)
            case 'violet': return '#9966ff';
            case 'red': return '#ff3333';
            case 'yellow': return '#ffdd33';
            case 'blue': return '#3366ff';
            case 'green': return '#33cc66';
            default: return '#cc3333';
        }
    }

    isBossLevel(levelNum) {
        return [3, 6, 9, 12, 15].includes(levelNum);
    }

    updateScoreMultiplier() {
        const currentTime = Date.now();

        //⏰ POINTS FREEZE: Stopping decay butand toin
        if (window.boostManager && window.boostManager.isBoostActive('POINTS_FREEZE')) {
            //fromwithandin on toand
            if (!this._pointsFreezeStartTime) {
                this._pointsFreezeStartTime = currentTime;
            }
            //NOT Updating butand - withwith on to onandand
            return;
        } else {
            //if to to toandwith, Adding in toand
            if (this._pointsFreezeStartTime) {
                const freezeDuration = currentTime - this._pointsFreezeStartTime;
                this.pointsFreezeTotalTime += freezeDuration;
                this._pointsFreezeStartTime = null;
            }
        }

        //inand but in from inand
        const elapsedTime = currentTime - this.levelStartTime - this.pointsFreezeTotalTime;
        const intervalsPassedFloat = elapsedTime / GAME_CONSTANTS.SCORING.DECAY_INTERVAL;
        const intervalsPassed = Math.floor(intervalsPassedFloat);
        const decayAmount = intervalsPassed * GAME_CONSTANTS.SCORING.DECAY_RATE;
        this.currentScoreMultiplier = Math.max(GAME_CONSTANTS.SCORING.MIN_PERCENTAGE, 1.0 - decayAmount);
    }

    getInvaderScore(rowIndex) {

        const rowScores = [
            GAME_CONSTANTS.SCORING.BASE_SCORES.ROW_5,
            GAME_CONSTANTS.SCORING.BASE_SCORES.ROW_4,
            GAME_CONSTANTS.SCORING.BASE_SCORES.ROW_3,
            GAME_CONSTANTS.SCORING.BASE_SCORES.ROW_2,
            GAME_CONSTANTS.SCORING.BASE_SCORES.ROW_1
        ];

        let baseScore = rowScores[rowIndex] || 10;

        if (!this.isBossLevel(this.level) && GAME_CONSTANTS.SCORING.LEVEL_MULTIPLIERS[this.level]) {
            baseScore = Math.floor(baseScore * GAME_CONSTANTS.SCORING.LEVEL_MULTIPLIERS[this.level]);
        }

        this.updateScoreMultiplier();

        //Safety check for NaN
        if (isNaN(this.currentScoreMultiplier)) {
            console.error('❌ currentScoreMultiplier is NaN, resetting to 1.0');
            this.currentScoreMultiplier = 1.0;
        }

        const finalScore = Math.floor(baseScore * this.currentScoreMultiplier);

        return finalScore;
    }

    logGameEvent(eventType, data) {
        if (!window.gameEventLog) {
            window.gameEventLog = [];
        }

        window.gameEventLog.push({
            type: eventType,
            data: data,
            timestamp: Date.now(),
            level: this.level,
            score: this.score
        });

        if (window.gameEventLog.length > 100) {
            window.gameEventLog.shift();
        }
    }

    exportToWindow() {
        //towith for withinwithandwithand with withwithinandand withthemeand
        //window.game inwith bootstrap' Object.defineProperty
        window.score = this.score;
        window.lives = this.lives;
        window.gameSpeed = this.gameSpeed;
        window.canvas = this.canvas;
        window.ctx = this.ctx;
        window.player = this.player;
        window.invaders = this.invaders;
        window.bullets = this.bullets;
        window.invaderBullets = this.invaderBullets;
        window.particles = this.particles;
        window.ripples = this.ripples;
        window.healEffects = this.healEffects;
        window.deltaTime = this.deltaTime;
        window.invaderDirection = this.invaderDirection;
        window.invaderSpeed = this.invaderSpeed;
        window.shotCooldown = this.shotCooldown;
        window.level = this.level;
        window.gameState = this.gameState;
        window.easterEggManager = this.easterEggManager;

        //Export methods for boost system
        window.moveInvaders = this.moveInvaders.bind(this);
        window.damagePlayer = this.damagePlayer.bind(this);
        window.updatePlayer = this.updatePlayer.bind(this);
        window.renderPlayer = this.drawPlayer.bind(this);
        window.updateBullets = this.updateBullets.bind(this);
        window.createExplosion = this.createExplosion.bind(this);
        window.createParticle = this.createParticle ? this.createParticle.bind(this) : null;
        window.createRipple = this.createRipple.bind(this);
        window.createHealEffect = this.createHealEffect.bind(this);
        window.createBullet = this.createBullet.bind(this);
        window.updateInvaders = this.updateInvaders.bind(this);
        window.checkCollisions = this.checkCollisions.bind(this);
    }

    destroy() {
        clearAllGameTimers();

        if (this.easterEggManager) {
            this.easterEggManager.destroy();
        }

        if (this.toastySystem) {
            this.toastySystem.destroy();
        }

        if (this.sailorSystem) {
            this.sailorSystem.destroy();
        }
    }
}

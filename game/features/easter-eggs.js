//SEA INVADERS - EASTER EGGS SYSTEM
//Toasty, Sailor, Pika systems

//TOASTY SYSTEM (as in Mortal Kombat)
export class ToastySystem {
    constructor() {
        this.image = null;
        this.element = null;
        this.isShowing = false;
    }

    init(tournamentMode = false) {
        //with in but fromand
        let imagePath;
        const hasPreloadedEggs = window.preloadManager && window.preloadManager.loadedImages.easterEggs;

        if (hasPreloadedEggs && window.preloadManager.loadedImages.easterEggs['pika']) {
            //but fromand
            this.image = window.preloadManager.loadedImages.easterEggs['pika'];
            imagePath = this.image.src;
        } else {
            //Fallback: Loading fromand
            if (window.themeManager && window.themeManager.isInitialized) {
                imagePath = window.themeManager.getImagePath('easterEggs', 'pika');
            } else {
                const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
                imagePath = window.location.pathname.includes('/tournament/')
                    ? `../themes/${currentTheme}/images/pika.png`
                    : `themes/${currentTheme}/images/pika.png`;
            }

            this.image = new Image();
            this.image.onerror = (e) => console.error(' Pika image failed to load:', imagePath, e);
            this.image.src = imagePath;
            console.warn(' Pika easter egg not preloaded, loading now...');
        }

        const isMobile = window.innerWidth <= 768;
        const imageSize = isMobile ? '80px' : '150px';

        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            left: -${isMobile ? '100' : '200'}px;
            bottom: ${isMobile ? '10%' : '20%'};
            z-index: 10003;
            pointer-events: none;
            transition: left 0.3s ease-out;
        `;

        const img = document.createElement('img');
        img.src = imagePath;
        img.style.cssText = `
            width: ${imageSize};
            height: auto;
            filter: drop-shadow(3px 3px 6px rgba(0,0,0,0.7));
        `;

        this.element.appendChild(img);

        if (tournamentMode) {
            const gameModal = document.querySelector('.tournament-game-modal');
            if (gameModal) {
                gameModal.appendChild(this.element);
            } else {
                document.body.appendChild(this.element);
            }
        } else {
            document.body.appendChild(this.element);
        }
    }

    show() {
        if (this.isShowing) return;
        this.isShowing = true;

        if (window.soundManager && typeof window.soundManager.playSound === 'function') {
            soundManager.playSound('toasty', 1.0, 1.0);
        }

        const isMobile = window.innerWidth <= 768;
        const showPosition = isMobile ? '10px' : '20px';
        this.element.style.left = showPosition;

        setTimeout(() => {
            this.hide();
        }, 3330);
    }

    hide() {
        const isMobile = window.innerWidth <= 768;
        this.element.style.left = `-${isMobile ? '100' : '200'}px`;

        setTimeout(() => {
            this.isShowing = false;
        }, 300);
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

//SAILOR SYSTEM (within toon)
export class SailorSystem {
    constructor() {
        this.image = null;
        this.element = null;
        this.isShowing = false;
    }

    init(tournamentMode = false) {
        if (this.element) return; //andandandfromandin

        //with in but fromand
        let imagePath;
        const hasPreloadedEggs = window.preloadManager && window.preloadManager.loadedImages.easterEggs;

        if (hasPreloadedEggs && window.preloadManager.loadedImages.easterEggs['sailor']) {
            //but fromand
            this.image = window.preloadManager.loadedImages.easterEggs['sailor'];
            imagePath = this.image.src;
        } else {
            //Fallback: Loading fromand
            if (window.themeManager && window.themeManager.isInitialized) {
                imagePath = window.themeManager.getImagePath('easterEggs', 'sailor');
            } else {
                const currentTheme = window.themeManager ? window.themeManager.getCurrentTheme() : 'default';
                imagePath = window.location.pathname.includes('/tournament/')
                    ? `../themes/${currentTheme}/images/sailor.png`
                    : `themes/${currentTheme}/images/sailor.png`;
            }
            console.warn(' Sailor easter egg not preloaded, loading now...');
        }

        const isMobile = window.innerWidth <= 768;
        const imageSize = isMobile ? '80px' : '150px';

        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            right: -${isMobile ? '100' : '200'}px;
            bottom: ${isMobile ? '10%' : '20%'};
            z-index: 10003;
            pointer-events: none;
            transition: right 0.3s ease-out;
        `;

        const img = document.createElement('img');
        img.onerror = (e) => console.error(' Sailor image failed to load:', imagePath, e);
        img.src = imagePath;
        img.style.cssText = `
            width: ${imageSize};
            height: auto;
            filter: drop-shadow(3px 3px 6px rgba(0,0,0,0.7));
        `;

        this.element.appendChild(img);

        if (tournamentMode) {
            const gameModal = document.querySelector('.tournament-game-modal');
            if (gameModal) {
                gameModal.appendChild(this.element);
            } else {
                document.body.appendChild(this.element);
            }
        } else {
            document.body.appendChild(this.element);
        }
    }

    show() {
        if (this.isShowing) return;
        this.isShowing = true;

        if (window.soundManager && typeof window.soundManager.playSound === 'function') {
            soundManager.playSound('cu', 1.0, 1.0);
        }

        const isMobile = window.innerWidth <= 768;
        const showPosition = isMobile ? '10px' : '20px';
        this.element.style.right = showPosition;

        setTimeout(() => {
            this.hide();
        }, 3330);
    }

    hide() {
        if (!this.isShowing) return;
        this.isShowing = false;

        const isMobile = window.innerWidth <= 768;
        this.element.style.right = `-${isMobile ? '100' : '200'}px`;
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}

//EASTER EGG MANAGER
export class EasterEggManager {
    constructor(toastySystem, sailorSystem) {
        this.toastySystem = toastySystem;
        this.sailorSystem = sailorSystem;
        this.mobsKilledInRound = 0;
        this.totalMobsInRound = 0;
        this.milestone77Triggered = false;
        this.pikaTriggered = false;
        this.sailorTriggered = false;
        this.gameState = null; //Will be set by engine
    }

    init() {
        this.resetRoundProgress();
    }

    resetRoundProgress() {
        this.mobsKilledInRound = 0;
        this.totalMobsInRound = 0;
        this.milestone77Triggered = false;
    }

    setTotalMobsInRound(count) {
        this.totalMobsInRound = count;
        this.mobsKilledInRound = 0;
        this.milestone77Triggered = false;
    }

    onMobKilled() {
        this.mobsKilledInRound++;
        const percentage = (this.mobsKilledInRound / this.totalMobsInRound) * 100;

        if (!this.milestone77Triggered && percentage >= 77) {
            this.milestone77Triggered = true;
            this.tryShowEasterEgg(0.20, 'mob_77_percent');
        }
    }

    onBossDefeated() {
        this.tryShowEasterEgg(0.12, 'boss_defeated');
    }

    onBoostPickup() {
        this.tryShowEasterEgg(0.04, 'boost_pickup');
    }

    onScoreUpdate(currentScore) {
        //Pika within at in towithandandand 3000 toin
        if (!this.pikaTriggered && currentScore >= 3000) {
            this.pikaTriggered = true;
            this.showSpecificEasterEgg('toasty', 'score_3000_pika');
        }

        //Sailor within at in towithandandand 6000 toin
        if (!this.sailorTriggered && currentScore >= 6000) {
            this.sailorTriggered = true;
            this.showSpecificEasterEgg('sailor', 'score_6000_sailor');
        }
    }

    tryShowEasterEgg(chance, trigger) {
        //Checking gameState - withto or toand
        const currentState = typeof this.gameState === 'function'
            ? this.gameState()
            : this.gameState;

        if (currentState !== 'playing' ||
            this.toastySystem.isShowing ||
            this.sailorSystem.isShowing) {
            return;
        }

        const random = Math.random();
        if (random <= chance) {
            this.showRandomEasterEgg(trigger);
        }
    }

    showRandomEasterEgg(trigger) {
        const random = Math.random();
        if (random < 0.5) {
            this.toastySystem.show();
        } else {
            this.sailorSystem.show();
        }
    }

    showSpecificEasterEgg(type, trigger) {
        //Checking gameState - withto or toand
        const currentState = typeof this.gameState === 'function'
            ? this.gameState()
            : this.gameState;

        if (currentState !== 'playing') {
            return;
        }

        if (trigger.includes('score_')) {
            if (this.toastySystem.isShowing || this.sailorSystem.isShowing) {
                setTimeout(() => {
                    this.showSpecificEasterEgg(type, trigger);
                }, 2000);
                return;
            }
        } else {
            if (this.toastySystem.isShowing || this.sailorSystem.isShowing) {
                return;
            }
        }

        if (type === 'toasty') {
            this.toastySystem.show();
        } else if (type === 'sailor') {
            this.sailorSystem.show();
        }
    }

    destroy() {
        this.resetRoundProgress();
        this.pikaTriggered = false;
        this.sailorTriggered = false;
    }
}

//SCREAM SYSTEM (Halloween Easter Egg - butto toandto)
export class ScreamSystem {
    constructor() {
        this.image = null;
        this.sound = null;
        this.element = null;
        this.isShowing = false;
        this.randomTimeout = null;
    }

    init(tournamentMode = false) {
        //Loading fromand
        const hasPreloadedEggs = window.preloadManager && window.preloadManager.loadedImages.easterEggs;
        if (hasPreloadedEggs && window.preloadManager.loadedImages.easterEggs['scream']) {
            this.image = window.preloadManager.loadedImages.easterEggs['scream'];
        } else {
            const imagePath = window.location.pathname.includes('/tournament/')
                ? '../themes/halloween/images/scream.webp'
                : 'themes/halloween/images/scream.webp';
            this.image = new Image();
            this.image.onerror = (e) => console.error(' Scream image failed to load:', imagePath, e);
            this.image.src = imagePath;
            console.warn(' Scream easter egg not preloaded, loading now...');
        }

        //Loading sound
        const soundPath = window.location.pathname.includes('/tournament/')
            ? '../themes/halloween/sounds/sfx/boosts/scream.mp3'
            : 'themes/halloween/sounds/sfx/boosts/scream.mp3';
        this.sound = new Audio(soundPath);
        this.sound.volume = 0.7;

        //Creating DOM element (withto by default)
        this.element = document.createElement('div');
        this.element.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 10005;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.1s ease-in-out;
            background: black;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        const img = document.createElement('img');
        img.src = this.image.src;
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;

        this.element.appendChild(img);
        document.body.appendChild(this.element);
    }

    show() {
        if (this.isShowing) return;

        this.isShowing = true;

        //whilein fromand on inwith to
        this.element.style.opacity = '1';

        //inwithfrominand sound from on to to
        this.sound.currentTime = 0;
        this.sound.play().catch(err => console.error('Failed to play scream sound:', err));

        //withtoin 3 seconds
        setTimeout(() => {
            this.element.style.opacity = '0';
            this.isShowing = false;
        }, 3000);
    }

    //Start with timer (30-70 withto)
    startRandomTimer(gameState) {
        this.stopRandomTimer();

        const scheduleNext = () => {
            //Checking game in withwithandand playing
            if (typeof gameState === 'function' && gameState() !== 'playing') {
                //if game NOT in mode playing, Checking to 5 withto
                this.randomTimeout = setTimeout(scheduleNext, 5000);
                return;
            }

            const delay = (30 + Math.random() * 40) * 1000; //30-70 withto

            this.randomTimeout = setTimeout(() => {
                if (typeof gameState === 'function' && gameState() === 'playing') {
                    this.show();
                }
                scheduleNext(); //and next
            }, delay);
        };

        scheduleNext();
    }

    stopRandomTimer() {
        if (this.randomTimeout) {
            clearTimeout(this.randomTimeout);
            this.randomTimeout = null;
        }
    }

    destroy() {
        this.stopRandomTimer();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        if (this.sound) {
            this.sound.pause();
            this.sound = null;
        }
    }
}

//KNIFE GHOST SYSTEM (Halloween Special)
export class KnifeGhostSystem {
    constructor() {
        this.ghostImage = null;
        this.sound = null;
        this.container = null;
        this.isActive = false;
        this.animationFrame = null;
    }

    init(tournamentMode = false) {
        //Loading fromand atto
        const hasPreloadedEggs = window.preloadManager && window.preloadManager.loadedImages.easterEggs;
        if (hasPreloadedEggs && window.preloadManager.loadedImages.easterEggs['knife']) {
            this.ghostImage = window.preloadManager.loadedImages.easterEggs['knife'];
        } else {
            const imagePath = window.location.pathname.includes('/tournament/')
                ? '../themes/halloween/images/knife.png'
                : 'themes/halloween/images/knife.png';
            this.ghostImage = new Image();
            this.ghostImage.src = imagePath;
            console.warn(' Knife ghost image not preloaded, loading now...');
        }

        //Loading sound
        const soundPath = window.location.pathname.includes('/tournament/')
            ? '../themes/halloween/sounds/sfx/boosts/knife.mp3'
            : 'themes/halloween/sounds/sfx/boosts/knife.mp3';
        this.sound = new Audio(soundPath);
        this.sound.volume = 0.8;

        //withyes toNOT for effects
        this.container = document.createElement('div');
        this.container.id = 'knifeGhostContainer';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 99999;
            pointer-events: none;
            overflow: visible;
        `;

        if (tournamentMode) {
            const gameModal = document.querySelector('.tournament-game-modal');
            if (gameModal) {
                gameModal.appendChild(this.container);
            } else {
                document.body.appendChild(this.container);
            }
        } else {
            document.body.appendChild(this.container);
        }
    }

    //toandinand toand atto
    show(gameEngine) {
        if (this.isActive) return;

        this.isActive = true;

        //inwithfrominand sound
        this.sound.currentTime = 0;
        this.sound.play().catch(err => console.error('Failed to play knife sound:', err));

        //withyes atto
        this.createGhost();

        //withyes toinin effect
        this.createBloodSplatters();

        //andin 50% enemyin
        setTimeout(() => {
            this.killEnemies(gameEngine);
        }, 1000); //1 withto after on toand

        //in 3 seconds
        setTimeout(() => {
            this.cleanup();
            this.isActive = false;
        }, 3000);
    }

    //Creating atto, within onin
    createGhost() {
        const ghost = document.createElement('img');
        ghost.src = this.ghostImage.src;
        ghost.style.cssText = `
            position: absolute;
            right: -400px;
            top: 50%;
            transform: translateY(-50%);
            width: 350px;
            height: auto;
            filter: drop-shadow(0 0 30px rgba(139, 0, 0, 1));
            opacity: 1;
            animation: ghostFly 3.25s ease-in-out forwards;
            z-index: 99999;
        `;

        ghost.onerror = (e) => console.error(' Ghost image failed to load:', e);

        //Adding andand
        const style = document.createElement('style');
        style.textContent = `
            @keyframes ghostFly {
                0% {
                    right: -400px;
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    right: calc(100% + 400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);

        this.container.appendChild(ghost);

        //Deleting atto after andandand
        setTimeout(() => {
            if (ghost.parentNode) {
                ghost.parentNode.removeChild(ghost);
            }
            if (style.parentNode) {
                style.parentNode.removeChild(style);
            }
        }, 2000);
    }

    //Creating toinin and to
    createBloodSplatters() {
        const bloodCount = 15 + Math.floor(Math.random() * 10); //15-25

        for (let i = 0; i < bloodCount; i++) {
            setTimeout(() => {
                this.createBloodSplatter();
            }, Math.random() * 1500);
        }

        //Adding withor for toinin andand
        const bloodStyle = document.createElement('style');
        bloodStyle.id = 'bloodSplatterStyles';
        bloodStyle.textContent = `
            @keyframes bloodSplat {
                0% {
                    transform: translate(0, 0) scale(0);
                    opacity: 1;
                }
                20% {
                    transform: translate(var(--dx), var(--dy)) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translate(var(--dx), var(--dy)) scale(1);
                    opacity: 0;
                }
            }
            @keyframes bloodDrip {
                0% {
                    transform: translateY(0) scale(1);
                    opacity: 1;
                }
                100% {
                    transform: translateY(100px) scale(0.5);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(bloodStyle);
    }

    createBloodSplatter() {
        const isDroplet = Math.random() > 0.5;
        const splatter = document.createElement('div');

        const x = 20 + Math.random() * 60; //20-80% andand toon
        const y = 20 + Math.random() * 60; //20-80% inwithfrom toon

        const size = 10 + Math.random() * 30; //10-40px
        const dx = (Math.random() - 0.5) * 100; //with X
        const dy = (Math.random() - 0.5) * 100; //with Y

        splatter.style.cssText = `
            position: absolute;
            left: ${x}%;
            top: ${y}%;
            width: ${size}px;
            height: ${size}px;
            background: radial-gradient(circle, #8b0000 0%, #660000 50%, #330000 100%);
            border-radius: ${isDroplet ? '50%' : `${Math.random() * 50}% ${Math.random() * 50}% ${Math.random() * 50}% ${Math.random() * 50}%`};
            opacity: 0.8;
            pointer-events: none;
            --dx: ${dx}px;
            --dy: ${dy}px;
            animation: ${isDroplet ? 'bloodDrip' : 'bloodSplat'} ${1 + Math.random()}s ease-out forwards;
            filter: blur(${Math.random() * 2}px);
            box-shadow: 0 0 10px rgba(139, 0, 0, 0.6);
        `;

        this.container.appendChild(splatter);

        //Deleting after andandand
        setTimeout(() => {
            if (splatter.parentNode) {
                splatter.parentNode.removeChild(splatter);
            }
        }, 2000);
    }

    //and 50% enemyin on toNOT
    killEnemies(gameEngine) {
        if (!gameEngine || !gameEngine.invaders) {
            console.warn(' Game engine or invaders not available');
            return;
        }

        const totalEnemies = gameEngine.invaders.length;
        const killCount = Math.floor(totalEnemies * 0.5);

        //andin array enemyin and andin in 50%
        const shuffled = [...gameEngine.invaders].sort(() => Math.random() - 0.5);
        const toKill = shuffled.slice(0, killCount);

        toKill.forEach(enemy => {
            //from enemy as in
            enemy.isDead = true;

            //Adding points player - inand score toin
            if (gameEngine.score !== undefined) {
                let points;
                if (gameEngine.getInvaderScore && enemy.row !== undefined) {
                    points = gameEngine.getInvaderScore(enemy.row);
                } else {
                    points = enemy.points || 10;
                }

                gameEngine.score += points;

                //inandandin scoreandto and enemyin
                if (gameEngine.enemiesKilled !== undefined) {
                    gameEngine.enemiesKilled++;
                }

                if (gameEngine.updateScore) {
                    gameEngine.updateScore();
                }

                //into Easter Egg Manager (NOT inin with !)
                //from to ininwith from easter-eggs.js, NOT need inin onScoreUpdate
                //else will withtoNOTon towithand
            }

            //withyes effect withand
            if (gameEngine.createExplosion) {
                gameEngine.createExplosion(enemy.x, enemy.y, enemy.color || '#ff0000');
            }
        });

        //Deleting in enemyin from array
        gameEngine.invaders = gameEngine.invaders.filter(enemy => !enemy.isDead);
    }

    cleanup() {
        //Deleting inwith elements from toNOT
        if (this.container) {
            while (this.container.firstChild) {
                this.container.removeChild(this.container.firstChild);
            }
        }

        //Deleting withor
        const bloodStyles = document.getElementById('bloodSplatterStyles');
        if (bloodStyles && bloodStyles.parentNode) {
            bloodStyles.parentNode.removeChild(bloodStyles);
        }
    }

    destroy() {
        this.cleanup();
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        if (this.sound) {
            this.sound.pause();
            this.sound = null;
        }
        this.isActive = false;
    }
}

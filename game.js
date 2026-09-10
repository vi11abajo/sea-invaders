//SEA INVADERS - BOOTSTRAP FILE
//Initialize new modular game system
//VERSION: 20251218001

import { RegularGame } from './game/game.js?v=20251218001';

//Global variables for compatibility
let gameInstance = null;
let isStartingGame = false;
let currentGameSession = null; //Global variable to pass session
let resourcesPreloaded = false; //Resource preload flag

//PRELOAD ALL RESOURCES ON PAGE LOAD
async function preloadAllResources() {
    if (resourcesPreloaded) {
        return;
    }


    //Detect theme (Coraluna, Xmas or regular)
    const isCoraluna = !!document.getElementById('coralunaLoadingScreen');
    const isXmas = !!document.getElementById('xmasLoadingScreen');

    //Get loading screen elements depending on theme
    const loadingScreen = isXmas
        ? document.getElementById('xmasLoadingScreen')
        : (isCoraluna
            ? document.getElementById('coralunaLoadingScreen')
            : document.getElementById('loadingScreen'));
    const progressFill = isXmas
        ? document.getElementById('xmasLoadingProgressFill')
        : (isCoraluna
            ? document.getElementById('coralunaLoadingProgressFill')
            : document.getElementById('loadingProgressFill'));
    const progressText = isXmas
        ? document.getElementById('xmasLoadingProgressText')
        : (isCoraluna
            ? document.getElementById('coralunaLoadingProgressText')
            : document.getElementById('loadingProgressText'));
    const statusText = isXmas
        ? document.getElementById('xmasLoadingStatus')
        : (isCoraluna
            ? document.getElementById('coralunaLoadingStatus')
            : document.getElementById('loadingStatus'));

    //Wait for PreloadManager to load if it's not yet available (with multiple attempts)
    let attempts = 0;
    const maxAttempts = 10;
    while (!window.preloadManager && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
    }

    if (!window.preloadManager) {
        console.error(' PreloadManager not found after waiting');
        console.error(' All window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('preload')));
        resourcesPreloaded = true;
        showGameContent();
        return;
    }


    try {
        //Setup callbacks for progress updates
        window.preloadManager.onProgress((data) => {
            const { progress, category } = data;

            //Update progress bar
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }

            //Update percentage text
            if (progressText) {
                progressText.textContent = `${progress}%`;
            }

            //Update status
            if (statusText) {
                const categoryNames = {
                    'player': ' Loading player',
                    'crabs': ' Loading enemies',
                    'music': ' Loading music',
                    'sfx': ' Loading sounds',
                    'ambient': ' Loading ambient',
                    'images': ' Loading images',
                    'sounds': ' Loading audio'
                };
                const categoryName = categoryNames[category] || '⏳ Loading';
                statusText.textContent = `${categoryName}...`;
            }
        });

        window.preloadManager.onComplete((data) => {
            if (statusText) {
                statusText.textContent = ' Ready to fight!';
            }
            if (progressText) {
                progressText.textContent = '100%';
            }
        });

        //Load all resources
        await window.preloadManager.loadAll();

        //Hide loading screen with animation
        if (isXmas && window.xmasLoadingScreen && typeof window.xmasLoadingScreen.hide === 'function') {
            //For Xmas use special method with animation (if available)
            await window.xmasLoadingScreen.hide();
        } else if (isCoraluna && window.coralunaLoadingScreen && typeof window.coralunaLoadingScreen.hide === 'function') {
            //For Coraluna use special method with animation (if available)
            await window.coralunaLoadingScreen.hide();
        } else if (loadingScreen) {
            //Standard CSS hiding for all themes
            const fadeClass = isXmas ? 'xmas-loading-screen-fade-out' : (isCoraluna ? 'coraluna-loading-screen-fade-out' : 'loading-screen-fade-out');
            loadingScreen.classList.add(fadeClass);
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }

        resourcesPreloaded = true;

        //Dispatch event that preload is complete
        window.dispatchEvent(new Event('preloadComplete'));

        //Show game content
        showGameContent();

    } catch (error) {
        console.error(' Preload error:', error);
        resourcesPreloaded = true;

        //Hide loading screen even on error
        if (isCoraluna && window.coralunaLoadingScreen && typeof window.coralunaLoadingScreen.hide === 'function') {
            window.coralunaLoadingScreen.hide();
        } else if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }

        showGameContent();
    }
}

//Function to show game content
function showGameContent() {
    const gameContent = document.getElementById('gameContent');
    if (gameContent) {
        gameContent.style.display = 'block';
    }
}

//Start preload on page load
window.addEventListener('DOMContentLoaded', async () => {
    //FIRST initialize Theme Manager
    if (window.themeManager) {
        await window.themeManager.loadThemesConfig();
    }

    //THEN start resource preload
    await preloadAllResources();
});

//Detect game mode
function detectGameMode() {
    return 'regular';
}

//Create game instance
function createGameInstance() {
    return new RegularGame({
        canvasId: 'gameCanvas'
    });
}

//Game start function
window.startGame = async function startGame() {
    try {
        //Protection against repeated calls
        if (isStartingGame) {
            return;
        }

        //Check if game is already running
        if (gameInstance && gameInstance.gameState === 'playing') {
            return;
        }

        //FPS CHECK BEFORE GAME START
        if (window.fpsAntiCheat) {
            const canStart = await window.fpsAntiCheat.checkBeforeGameStart();
            if (!canStart) {
                isStartingGame = false;
                return;
            }
        }

        isStartingGame = true;

        //Halloween ambient: play START sound
        if (window.halloweenAmbient) {
            window.halloweenAmbient.playStartSound();
        }

        //TOURNAMENT MODE - skip payment
        if (window.tournamentMode) {
            actuallyStartGame();
            return;
        }

        //For regular game check authorization
        if (!window.authManager) {
            isStartingGame = false;
            console.error(' Auth Manager not found');
            alert('Authentication system not loaded. Please refresh the page.');
            return;
        }

        if (!window.authManager.isAuthenticated()) {
            isStartingGame = false;
            alert('Please login with Discord to play');
            window.authManager.loginWithDiscord();
            return;
        }

        //Start game session through backend
        if (window.gameSessionManager) {
            try {
                const session = await window.gameSessionManager.startSession('classic');
                if (session && session.sessionId) {
                    currentGameSession = session.sessionId;
                } else {
                    currentGameSession = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                }
            } catch (error) {
                console.error(' Failed to start game session:', error);
                currentGameSession = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
        } else {
            currentGameSession = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        actuallyStartGame();

    } catch (error) {
        isStartingGame = false;
        console.error(' GAME START ERROR:', error);

        //Re-enable button
        const startButtons = document.querySelectorAll('button[onclick*="startGame"]');
        startButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        });

        alert(`Failed to start game: ${error.message}`);
    }
};

//Actual game start function
function actuallyStartGame() {

    //Create game instance if it doesn't exist
    if (!gameInstance) {
        gameInstance = createGameInstance();

        //Assign session IMMEDIATELY after creating instance
        if (currentGameSession) {
            gameInstance.currentGameSession = currentGameSession;
        }

        //Initialize game
        gameInstance.init().then(() => {
            startGameplay();
        }).catch(error => {
            console.error(' Game initialization failed:', error);
            isStartingGame = false;
            alert(`Failed to initialize game: ${error.message}`);
        });
    } else {
        //If instance already exists, update session
        if (currentGameSession) {
            gameInstance.currentGameSession = currentGameSession;
        }
        startGameplay();
    }
}

function startGameplay() {
    //Start game music
    if (window.soundManager && !window.tournamentMode && window.soundManager.musicEnabled) {
        soundManager.stopMusic(true);
        setTimeout(() => {
            const musicTrack = 'gameplay';
            soundManager.playMusic(musicTrack, true, false);
        }, 100);
    }

    //Clear boosts on new game start
    if (window.clearAllBoosts) {
        window.clearAllBoosts();
    }

    //Reset FPS Anti-Cheat
    if (window.fpsAntiCheat) {
        window.fpsAntiCheat.resetOnNewGame();
    }

    //Hide start screen, show canvas
    const startScreen = document.getElementById('startScreen');
    const gameOverScreen = document.getElementById('gameOver');

    if (startScreen) startScreen.style.display = 'none';
    if (gameOverScreen) gameOverScreen.style.display = 'none';

    //Start game
    gameInstance.start();

    isStartingGame = false;
}

//Game restart function
window.restartGame = function restartGame() {

    document.body.classList.remove('game-over-active');

    //Stop easter egg systems
    if (gameInstance && gameInstance.easterEggManager) {
        gameInstance.easterEggManager.destroy();
    }

    //Clear boss and its GIF animation
    if (gameInstance && gameInstance.bossSystemV2) {
        gameInstance.bossSystemV2.clearBoss();
    }

    //Clear boost system
    if (window.clearAllBoosts) {
        window.clearAllBoosts();
    }

    //Hide game over, show start screen
    const gameOverEl = document.getElementById('gameOver');
    const startScreenEl = document.getElementById('startScreen');

    if (gameOverEl) gameOverEl.style.display = 'none';
    if (startScreenEl) startScreenEl.style.display = 'block';

    if (gameInstance) {
        gameInstance.gameState = 'start';
        gameInstance.scoreAlreadySaved = false;
        gameInstance.gameOverShown = false; //Reset game over display flag

        //CRITICAL FIX: Reset gameSpeed and invaderSpeed after game over
        gameInstance.gameSpeed = 1;
        gameInstance.invaderSpeed = gameInstance.config.CRAB_SPEED_BASE || 1;

        //Reinitialize easter eggs
        if (gameInstance.easterEggManager) {
            gameInstance.easterEggManager.init();
        }
    }

    //Return to menu music
    if (window.soundManager && !window.tournamentMode && soundManager.musicEnabled) {
        soundManager.stopMusic(true);
        setTimeout(() => {
            soundManager.playMusic('menu', true, false);
        }, 500);
    }

};

//Export game instance to window for compatibility
Object.defineProperty(window, 'game', {
    get: () => gameInstance,
    configurable: true
});

Object.defineProperty(window, 'gameEngine', {
    get: () => gameInstance,
    configurable: true
});

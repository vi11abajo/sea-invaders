//SEA INVADERS - REGULAR GAME MODE
//on game with inwithand andand

import { GameEngine } from '../core/game-engine.js?v=20251227003';
import { DEFAULT_CONFIG } from '../core/game-config.js?v=20251218001';

export class RegularGame extends GameEngine {
    constructor(config = {}) {
        super({
            mode: 'regular',
            ...DEFAULT_CONFIG,
            ...config
        });

        this.enableEasterEggs = true;
        this.enableBoosts = true;
        this.enableBoss = true;
        this.enableAntiCheat = true;
        this.saveScoreToServer = true;
    }

    async init() {
        await super.init();

        //Initialization boost system
        if (window.BoostManager) {
            window.boostManager = new BoostManager({
                canvas: this.canvas,
                ctx: this.ctx,
                player: this.player,
                invaders: this.invaders,
                gameSpeed: () => this.gameSpeed,
                score: () => this.score,
                lives: () => this.lives
            });
        }
    }

    async start() {
        super.start();

        //into to for regular game
        if (window.soundManager && soundManager.musicEnabled) {
            soundManager.playMusic('menu');
        }

        // Start game session for score tracking
        if (window.gameSessionManager && window.authManager?.isAuthenticated()) {
            try {
                await window.gameSessionManager.startSession('classic');
                console.log('✅ Game session started successfully');
            } catch (error) {
                console.warn('⚠️ Failed to start game session:', error);
            }
        }
    }

    //fromto Game Over for regular game
    async handleGameOver() {
        //Stopping andin andto
        this.gameState = 'gameOver';

        //Call React callback for Game Over
        if (this.onGameOver && typeof this.onGameOver === 'function') {
            this.onGameOver();
        }

        //Saving score on server (for regular game - in in leaderboard)
        if (this.saveScoreToServer && !this.scoreAlreadySaved) {
            await this.saveScore();
            this.scoreAlreadySaved = true;
        }

        //whilein to Game Over
        this.showGameOverScreen();
    }

    //Saving score in in leaderboard
    async saveScore() {
        if (!window.gameSessionManager) {
            console.error(' gameSessionManager not found');
            return;
        }

        try {
            const result = await window.gameSessionManager.submitScore({
                score: this.score,
                level: this.level,
                enemiesKilled: this.enemiesKilled || 0,
                accuracy: this.accuracy || 0
            });

            if (!result.success) {
                console.error(' Failed to save score:', result.error);
            }
        } catch (error) {
            console.error(' Error saving score:', error);
        }
    }

    showGameOverScreen() {
        const gameOverEl = document.getElementById('gameOver');
        const finalScoreEl = document.getElementById('finalScore');
        const finalLevelEl = document.getElementById('finalLevel');

        if (finalScoreEl) finalScoreEl.textContent = this.score;
        if (finalLevelEl) finalLevelEl.textContent = this.level;

        if (gameOverEl) {
            gameOverEl.style.display = 'block';
            document.body.classList.add('game-over-active');
        }

        //Stopping to and game sound game over
        if (window.soundManager) {
            soundManager.stopMusic();
            if (soundManager.soundPaths.sfx && soundManager.soundPaths.sfx.gameOver) {
                soundManager.playSound('gameOver', 0.5);
            }
        }
    }
}

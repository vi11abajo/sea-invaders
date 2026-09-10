//LOADING SCREEN
//Loading screen with progress bar and animation

class LoadingScreen {
    constructor() {
        this.container = null;
        this.progressBar = null;
        this.progressText = null;
        this.statusText = null;
        this.created = false;
    }

    /**
     * Create HTML for loading screen
     */
    create() {
        if (this.created) return;

        const html = `
            <div id="loadingScreen" class="loading-screen">
                <div class="loading-content">
                    <div class="loading-logo">
                        <div class="logo-glow"></div>
                        <img src="${this.getLogoPath()}" alt="sea invaders" class="loading-logo-image">
                        <div class="loading-subtitle">Preparing your battle station...</div>
                    </div>

                    <div class="loading-progress-container">
                        <div class="loading-progress-bar">
                            <div class="loading-progress-fill" id="loadingProgressFill"></div>
                            <div class="loading-progress-shine"></div>
                        </div>
                        <div class="loading-progress-text" id="loadingProgressText">0%</div>
                    </div>

                    <div class="loading-status" id="loadingStatus">Initializing...</div>

                    <div class="loading-tips">
                        <div class="loading-tip"> Tip: Collect power-ups to boost your abilities!</div>
                    </div>
                </div>

                <div class="loading-particles">
                    ${this.createParticles(20)}
                </div>
            </div>
        `;

        //Insert into body
        document.body.insertAdjacentHTML('afterbegin', html);

        //Get element references
        this.container = document.getElementById('loadingScreen');
        this.progressBar = document.getElementById('loadingProgressFill');
        this.progressText = document.getElementById('loadingProgressText');
        this.statusText = document.getElementById('loadingStatus');

        this.created = true;

        //Add styles
        this.injectStyles();
    }

    /**
     * Get logo path depending on theme
     */
    getLogoPath() {
        // FIXED: Use pagePreset directly, not getCurrentTheme() which reads from localStorage
        // This ensures correct image for each page, ignoring old values in localStorage
        const currentTheme = window.themeManager?.getPagePreset() || 'default';
        const basePath = window.themeManager?.isInitialized && typeof window.themeManager._detectBasePath === 'function'
            ? window.themeManager._detectBasePath()
            : '.';
        return `${basePath}/themes/${currentTheme}/images/load.png`;
    }

    /**
     * Create particles for background
     */
    createParticles(count) {
        let html = '';
        for (let i = 0; i < count; i++) {
            const size = Math.random() * 3 + 1;
            const left = Math.random() * 100;
            const duration = Math.random() * 3 + 2;
            const delay = Math.random() * 2;

            html += `<div class="loading-particle" style="
                width: ${size}px;
                height: ${size}px;
                left: ${left}%;
                animation-duration: ${duration}s;
                animation-delay: ${delay}s;
            "></div>`;
        }
        return html;
    }

    /**
     * Update withwith
     */
    updateProgress(data) {
        if (!this.created) return;

        const { progress, category, name } = data;

        //Update progress bar
        if (this.progressBar) {
            this.progressBar.style.width = `${progress}%`;
        }

        //Update percentage text
        if (this.progressText) {
            this.progressText.textContent = `${progress}%`;
        }

        //Update status
        if (this.statusText) {
            const categoryNames = {
                'player': ' Loading player',
                'crabs': ' Loading enemies',
                'boss': ' Loading boss',
                'boss-animations': ' Loading animations',
                'music': ' Loading music',
                'sfx': ' Loading sounds',
                'ambient': ' Loading ambient',
                'images': ' Loading images',
                'sounds': ' Loading audio'
            };

            const categoryName = categoryNames[category] || '⏳ Loading';
            this.statusText.textContent = `${categoryName}...`;
        }
    }

    /**
     * while inand toand
     */
    showComplete() {
        if (!this.created) return;

        if (this.statusText) {
            this.statusText.textContent = ' Ready to fight!';
        }

        if (this.progressText) {
            this.progressText.textContent = '100%';
        }
    }

    /**
     * withto loading screen with andand
     */
    hide() {
        if (!this.created || !this.container) return;

        return new Promise((resolve) => {
            this.container.classList.add('loading-screen-fade-out');

            setTimeout(() => {
                if (this.container && this.container.parentNode) {
                    this.container.parentNode.removeChild(this.container);
                }
                this.created = false;
                resolve();
            }, 500);
        });
    }

    /**
     * inNOTand CSS withor
     */
    injectStyles() {
        if (document.getElementById('loadingScreenStyles')) return;

        const styles = `
            <style id="loadingScreenStyles">
                .loading-screen {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #0a0e27 0%, #1a1a3e 100%);
                    z-index: 99999;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    overflow: hidden;
                }

                .loading-screen-fade-out {
                    animation: fadeOut 0.5s ease-out forwards;
                }

                @keyframes fadeOut {
                    to {
                        opacity: 0;
                        transform: scale(1.1);
                    }
                }

                .loading-content {
                    text-align: center;
                    z-index: 10;
                    max-width: 500px;
                    width: 90%;
                }

                .loading-logo {
                    margin-bottom: 40px;
                    position: relative;
                }

                .logo-glow {
                    position: absolute;
                    width: 200px;
                    height: 200px;
                    background: radial-gradient(circle, rgba(0, 255, 255, 0.3) 0%, transparent 70%);
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    animation: pulse 2s ease-in-out infinite;
                    pointer-events: none;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                }

                .loading-logo-image {
                    max-width: 400px;
                    width: 90%;
                    height: auto;
                    margin: 0 auto;
                    display: block;
                    filter: drop-shadow(0 0 20px rgba(0, 255, 255, 0.8))
                            drop-shadow(0 0 40px rgba(0, 255, 255, 0.5));
                    animation: logoGlow 2s ease-in-out infinite;
                }

                @keyframes logoGlow {
                    0%, 100% {
                        filter: drop-shadow(0 0 20px rgba(0, 255, 255, 0.8))
                                drop-shadow(0 0 40px rgba(0, 255, 255, 0.5));
                    }
                    50% {
                        filter: drop-shadow(0 0 30px rgba(0, 255, 255, 1))
                                drop-shadow(0 0 60px rgba(0, 255, 255, 0.8));
                    }
                }

                .loading-subtitle {
                    font-family: 'Arial', sans-serif;
                    font-size: 16px;
                    color: rgba(255, 255, 255, 0.6);
                    margin-top: 10px;
                    letter-spacing: 2px;
                }

                .loading-progress-container {
                    margin: 40px 0 20px 0;
                }

                .loading-progress-bar {
                    width: 100%;
                    height: 30px;
                    background: rgba(0, 0, 0, 0.5);
                    border: 2px solid rgba(0, 255, 255, 0.3);
                    border-radius: 15px;
                    overflow: hidden;
                    position: relative;
                    box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.5);
                }

                .loading-progress-fill {
                    height: 100%;
                    width: 0%;
                    background: linear-gradient(90deg,
                        #00ffff 0%,
                        #00cccc 50%,
                        #00ffff 100%);
                    transition: width 0.3s ease-out;
                    position: relative;
                    box-shadow: 0 0 20px rgba(0, 255, 255, 0.6);
                    border-radius: 13px;
                }

                .loading-progress-shine {
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg,
                        transparent,
                        rgba(255, 255, 255, 0.3),
                        transparent);
                    animation: shine 2s infinite;
                }

                @keyframes shine {
                    to { left: 200%; }
                }

                .loading-progress-text {
                    font-family: 'Orbitron', monospace;
                    font-size: 24px;
                    font-weight: bold;
                    color: #00ffff;
                    margin-top: 15px;
                    text-shadow: 0 0 10px rgba(0, 255, 255, 0.8);
                }

                .loading-status {
                    font-family: 'Arial', sans-serif;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.7);
                    margin-top: 20px;
                    min-height: 20px;
                    letter-spacing: 1px;
                }

                .loading-tips {
                    margin-top: 40px;
                    opacity: 0.5;
                }

                .loading-tip {
                    font-family: 'Arial', sans-serif;
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.6);
                    font-style: italic;
                }

                .loading-particles {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    pointer-events: none;
                }

                .loading-particle {
                    position: absolute;
                    background: rgba(0, 255, 255, 0.6);
                    border-radius: 50%;
                    bottom: -10px;
                    animation: floatUp 5s linear infinite;
                    box-shadow: 0 0 10px rgba(0, 255, 255, 0.8);
                }

                @keyframes floatUp {
                    to {
                        transform: translateY(-100vh) rotate(360deg);
                        opacity: 0;
                    }
                }

                /* Mobile adjustments */
                @media (max-width: 768px) {
                    .loading-logo-image {
                        max-width: 300px;
                    }

                    .loading-subtitle {
                        font-size: 14px;
                    }

                    .loading-progress-bar {
                        height: 20px;
                    }

                    .loading-progress-text {
                        font-size: 18px;
                    }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

//Creating global instance
if (!window.loadingScreen) {
    window.loadingScreen = new LoadingScreen();
}

//towith
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoadingScreen;
}

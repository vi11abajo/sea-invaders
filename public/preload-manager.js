//PRELOAD MANAGER
//Preload all game resources with progress bar

class PreloadManager {
    constructor() {
        this.resources = {
            images: [],
            sounds: [],
            animations: [],
            bosses: []
        };

        this.loaded = 0;
        this.total = 0;
        this.progress = 0;

        this.onProgressCallback = null;
        this.onCompleteCallback = null;

        this.loadStartTime = Date.now();
        this.isLoading = false;      //Current loading flag
        this.hasLoaded = false;       //Completed loading flag

        //Storage of loaded Image objects for use in game-engine
        this.loadedImages = {
            player: {},
            crabs: {},
            bosses: {},
            easterEggs: {},
            bullet: null
        };
    }

    /**
     * Set progress callback
     */
    onProgress(callback) {
        this.onProgressCallback = callback;
    }

    /**
     * Set completion callback
     */
    onComplete(callback) {
        this.onCompleteCallback = callback;
    }

    /**
     * Update progress
     */
    updateProgress(category, name, loaded) {
        this.loaded++;
        this.progress = Math.round((this.loaded / this.total) * 100);

        // Progress tracking (silent)

        if (this.onProgressCallback) {
            this.onProgressCallback({
                category,
                name,
                loaded: this.loaded,
                total: this.total,
                progress: this.progress
            });
        }

        //All loaded
        if (this.loaded >= this.total) {
            const loadTime = Date.now() - this.loadStartTime;

            if (this.onCompleteCallback) {
                this.onCompleteCallback({
                    loadTime,
                    total: this.total
                });
            }
        }
    }

    /**
     * Collect list of all images to load
     */
    collectImages() {
        const images = [];
        // Use themeManager methods even before async initialization - they work synchronously
        const basePath = (window.themeManager && typeof window.themeManager._detectBasePath === 'function')
            ? window.themeManager._detectBasePath()
            : '.';

        // HARDCODED PAGE PRESETS - same as in theme-manager.js
        // This ensures correct theme even when localStorage is cleared
        const detectPageTheme = () => {
            return 'default';  // Always use default theme
        };

        // Try multiple sources in order of priority
        // URL-based theme has HIGHEST priority to ensure correct theme even when themeManager returns wrong value
        const pagePreset = window.themeManager?.getPagePreset();
        const localStorageTheme = localStorage.getItem('selectedTheme');
        const urlBasedTheme = detectPageTheme();
        const currentTheme = urlBasedTheme || localStorageTheme || pagePreset;

        // Theme detection complete - final theme: ${currentTheme}

        //Player images (PNG format) - exact file names
        const playerImages = [
            { key: 'player_front', file: 'octopiFront.png' },
            { key: 'player_left', file: 'OctopiLeft.png' },
            { key: 'player_right', file: 'octopiRight.png' },
            { key: 'player_ooff', file: 'OctopiOoff.png' }
        ];

        playerImages.forEach(({ key, file }) => {
            images.push({
                key: key,
                path: `${basePath}/themes/${currentTheme}/images/${file}`,
                category: 'player'
            });
        });

        //Bullet image - not used for default theme
        //Canvas rendering is used instead (fallback in game-engine.js)

        //Crab images (WebP format)
        ['Green', 'Blue', 'Yellow', 'Red', 'Violet'].forEach(type => {
            images.push({
                key: `crab_${type.toLowerCase()}`,
                path: `${basePath}/themes/${currentTheme}/images/crab${type}.png`,
                category: 'crabs'
            });
        });

        //🔧 MOBILE FIX: Boss images in PNG format
        // GIF 2.4MB → PNG optimized
        const bossFormat = 'png';

        const bossTypes = [
            { key: 'crabBOSSGreen', file: `crabBOSSGreen.${bossFormat}` },
            { key: 'crabBossBlue', file: `crabBossBlue.${bossFormat}` },
            { key: 'crabBossYellow', file: `crabBossYellow.${bossFormat}` },
            { key: 'crabBossRed', file: `crabBossRed.${bossFormat}` },
            { key: 'crabBossViolet', file: `crabBossViolet.${bossFormat}` }
        ];

        bossTypes.forEach(({ key, file }) => {
            const fullPath = `${basePath}/themes/${currentTheme}/images/${file}`;
            images.push({
                key: key,
                path: fullPath,
                category: 'bosses'
            });
        });

        //Easter Egg images
        //Common easter eggs for all themes
        const commonEasterEggs = ['pika', 'sailor', 'hero'];

        //Load common easter eggs
        const easterEggFormat = 'png';
        commonEasterEggs.forEach(egg => {
            images.push({
                key: `easteregg_${egg}`,
                path: `${basePath}/themes/${currentTheme}/images/${egg}.${easterEggFormat}`,
                category: 'easterEggs'
            });
        });

        return images;
    }

    /**
     * Collect list of all sounds for loading
     */
    collectSounds() {
        if (!window.soundManager) {
            return [];
        }

        const sounds = [];
        const soundPaths = window.soundManager.soundPaths;

        //music
        if (soundPaths.music) {
            Object.entries(soundPaths.music).forEach(([key, path]) => {
                sounds.push({
                    key: `music_${key}`,
                    path: path,
                    category: 'music',
                    isMusic: true
                });
            });
        }

        //sound effects
        if (soundPaths.sfx) {
            Object.entries(soundPaths.sfx).forEach(([key, path]) => {
                sounds.push({
                    key: `sfx_${key}`,
                    path: path,
                    category: 'sfx',
                    isMusic: false
                });
            });
        }

        //Ambient sounds
        if (soundPaths.ambient) {
            Object.entries(soundPaths.ambient).forEach(([key, path]) => {
                sounds.push({
                    key: `ambient_${key}`,
                    path: path,
                    category: 'ambient',
                    isMusic: false
                });
            });
        }

        return sounds;
    }

    /**
     * Collect list of boss animations
     */
    collectBossAnimations() {
        //Boss GIF animations are not used in preload (loaded separately in boss-system.js)
        return [];
    }

    /**
     * Load image
     */
    loadImage(resource) {
        return new Promise((resolve) => {
            // 🔍 LOGGING: Start loading
            const startTime = Date.now();
            // Loading image: ${resource.key}

            const img = new Image();
            let resolved = false;

            // 🔧 MOBILE FIX: Timeout 10 seconds (optimized)
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`⏱️ Image timeout (10s): ${resource.path}`);
                    this.updateProgress('images', resource.key, false);
                    resolve({ success: false, resource, timeout: true });
                }
            }, 10000); // 10 seconds

            img.onload = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);

                    // 🔍 LOGGING: Successful loading
                    const loadTime = Date.now() - startTime;
                    // Image loaded: ${resource.key}

                    //Save loaded image
                    if (resource.category === 'player') {
                        //player_front → front, player_ooff → ouch (for compatibility with game-engine)
                        const playerKey = resource.key.replace('player_', '');
                        const gameEngineKey = playerKey === 'ooff' ? 'ouch' : playerKey;
                        this.loadedImages.player[gameEngineKey] = img;
                    } else if (resource.category === 'crabs') {
                        //crab_green → Green
                        const crabType = resource.key.replace('crab_', '');
                        const capitalizedType = crabType.charAt(0).toUpperCase() + crabType.slice(1);
                        this.loadedImages.crabs[capitalizedType] = img;
                    } else if (resource.category === 'bosses') {
                        //Save boss images by key (crabBOSSGreen, crabBossBlue, etc.)
                        this.loadedImages.bosses[resource.key] = img;
                    } else if (resource.category === 'easterEggs') {
                        //easteregg_pika → pika
                        const eggKey = resource.key.replace('easteregg_', '');
                        this.loadedImages.easterEggs[eggKey] = img;
                    } else if (resource.category === 'bullet') {
                        //Bullet image
                        this.loadedImages.bullet = img;
                    }

                    this.updateProgress('images', resource.key, true);
                    resolve({ success: true, resource, data: img });
                }
            };

            img.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);

                    //if optional - don't count as error
                    if (resource.optional) {
                        console.log(`ℹ️ Optional image not found: ${resource.path}`);
                        this.updateProgress('images', resource.key, false);
                        resolve({ success: false, resource, optional: true });
                    } else {
                        console.error(`❌ Failed to load image: ${resource.path}`);
                        this.updateProgress('images', resource.key, false);
                        resolve({ success: false, resource });
                    }
                }
            };

            img.src = resource.path;
        });
    }

    /**
     * Load sound
     */
    loadSound(resource) {
        return new Promise((resolve) => {
            if (!window.soundManager) {
                resolve({ success: false, resource });
                return;
            }

            // 🔍 LOGGING: Start loading sound
            const startTime = Date.now();
            // Loading sound: ${resource.key}

            //Use existing loadSound from soundManager
            window.soundManager.loadSound(resource.key, resource.path, resource.isMusic)
                .then(() => {
                    // 🔍 LOGGING: Successful loading
                    const loadTime = Date.now() - startTime;
                    // Sound loaded: ${resource.key}

                    this.updateProgress('sounds', resource.key, true);
                    resolve({ success: true, resource });
                })
                .catch((error) => {
                    const loadTime = Date.now() - startTime;
                    console.error(`❌ Failed to load sound in ${loadTime}ms: ${resource.path}`, error);
                    this.updateProgress('sounds', resource.key, false);
                    resolve({ success: false, resource });
                });
        });
    }

    /**
     * 🔧 PROGRESSIVE LOADING: Separate resources into critical and secondary
     */
    separateResources(images, sounds) {
        const critical = { images: [], sounds: [] };
        const secondary = { images: [], sounds: [] };

        // CRITICAL IMAGES: Only player + crabs
        images.forEach(img => {
            if (img.category === 'player' || img.category === 'crabs') {
                critical.images.push(img);
            } else {
                secondary.images.push(img);
            }
        });

        // CRITICAL SOUNDS: Only main SFX (NOT music!)
        sounds.forEach(sound => {
            if (!sound.isMusic && (sound.category === 'sfx' || sound.category === 'ambient')) {
                critical.sounds.push(sound);
            } else {
                secondary.sounds.push(sound);
            }
        });

        return { critical, secondary };
    }

    /**
     * 🔧 PROGRESSIVE LOADING: Load CRITICAL resources (Phase 1)
     */
    async loadCritical() {
        // Phase 1: Loading critical resources...

        const images = this.collectImages();
        const sounds = this.collectSounds();
        const { critical } = this.separateResources(images, sounds);

        this.total = critical.images.length + critical.sounds.length;
        this.loaded = 0;
        this.progress = 0;

        // Critical resources count: ${this.total}

        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const CONCURRENT_LIMIT = isMobile ? 15 : 20; // ✅ Increased for 4G/5G networks

        const loadBatch = async (items, loaderFn) => {
            const results = [];
            for (let i = 0; i < items.length; i += CONCURRENT_LIMIT) {
                const batch = items.slice(i, i + CONCURRENT_LIMIT);
                const batchResults = await Promise.all(
                    batch.map(item => loaderFn.call(this, item))
                );
                results.push(...batchResults);
            }
            return results;
        };

        const [imageResults, soundResults] = await Promise.all([
            loadBatch(critical.images, this.loadImage),
            loadBatch(critical.sounds, this.loadSound)
        ]);

        const loadTime = Date.now() - this.loadStartTime;
        // Phase 1 complete

        return { imageResults, soundResults, total: this.total, loaded: this.loaded };
    }

    /**
     * 🔧 PROGRESSIVE LOADING: Load SECONDARY resources (Phase 2 - in background)
     */
    async loadSecondary() {
        // Phase 2: Loading secondary resources...

        const images = this.collectImages();
        const sounds = this.collectSounds();
        const { secondary } = this.separateResources(images, sounds);

        // Save current progress
        const phase1Total = this.total;
        const phase1Loaded = this.loaded;

        // Update total for second phase
        this.total = phase1Total + secondary.images.length + secondary.sounds.length;

        // Secondary resources count: ${secondary.images.length + secondary.sounds.length}

        const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const CONCURRENT_LIMIT = isMobile ? 10 : 15; // ✅ Increased for background loading

        const loadBatch = async (items, loaderFn) => {
            const results = [];
            for (let i = 0; i < items.length; i += CONCURRENT_LIMIT) {
                const batch = items.slice(i, i + CONCURRENT_LIMIT);
                const batchResults = await Promise.all(
                    batch.map(item => loaderFn.call(this, item))
                );
                results.push(...batchResults);
            }
            return results;
        };

        const [imageResults, soundResults] = await Promise.all([
            loadBatch(secondary.images, this.loadImage),
            loadBatch(secondary.sounds, this.loadSound)
        ]);

        this.hasLoaded = true;
        const loadTime = Date.now() - this.loadStartTime;
        // Phase 2 complete

        return { imageResults, soundResults };
    }

    /**
     * Load all resources (NEW VERSION with progressive loading)
     */
    async loadAll() {
        //Protection from repeated calls
        if (this.hasLoaded) {
            // Resources already loaded
            return { success: true, cached: true };
        }

        if (this.isLoading) {
            // Preload in progress
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.hasLoaded) {
                        clearInterval(checkInterval);
                        resolve({ success: true, cached: true });
                    }
                }, 100);
            });
        }

        this.isLoading = true;
        // Starting resource preload
        this.loadStartTime = Date.now();

        // PHASE 1: Load critical resources (BLOCKING)
        const phase1 = await this.loadCritical();

        // Critical resources loaded - game can start

        // PHASE 2: Load secondary resources (NON-BLOCKING - in background)
        // Start in background, don't wait for completion
        this.loadSecondary().then(() => {
            // All resources loaded
        }).catch(err => {
            console.warn('⚠️ Secondary resources failed to load:', err);
        });

        // Return result IMMEDIATELY after phase 1
        this.isLoading = false;

        return {
            phase1,
            total: this.total,
            loaded: this.loaded,
            success: true
        };
    }

    /**
     * Get loaded image by key
     * @param {string} key - Image key (e.g.: 'bullet', 'player_front', 'crab_green')
     * @returns {Image|null} - Loaded image or null
     */
    getImage(key) {
        //Check bullet
        if (key === 'bullet') {
            return this.loadedImages.bullet;
        }

        //Check player images
        if (key.startsWith('player_')) {
            const playerKey = key.replace('player_', '');
            const gameEngineKey = playerKey === 'ooff' ? 'ouch' : playerKey;
            return this.loadedImages.player[gameEngineKey];
        }

        //Check crabs
        if (key.startsWith('crab_')) {
            const crabType = key.replace('crab_', '');
            const capitalizedType = crabType.charAt(0).toUpperCase() + crabType.slice(1);
            return this.loadedImages.crabs[capitalizedType];
        }

        //Check bosses
        if (this.loadedImages.bosses[key]) {
            return this.loadedImages.bosses[key];
        }

        //Check Easter Eggs
        if (key.startsWith('easteregg_')) {
            const eggKey = key.replace('easteregg_', '');
            return this.loadedImages.easterEggs[eggKey];
        }

        return null;
    }
}

//Create global instance
if (!window.preloadManager) {
    window.preloadManager = new PreloadManager();
}

//Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PreloadManager;
}

//SEA INVADERS - SOUND MANAGER
//Sound and music management system

class SoundManager {
    //Detect correct path to sounds folder based on device and page
    detectSoundsPath() {
        const currentPath = window.location.pathname;

        //Check if running in Next.js (Vercel) environment
        const isNextJS = window.location.hostname.includes('vercel.app') ||
                        window.location.hostname === 'localhost' && currentPath.startsWith('/game');

        //Use Theme Manager if available
        if (window.themeManager && window.themeManager.isInitialized) {
            //Theme Manager will determine base path considering tournament mode
            const basePath = window.themeManager._detectBasePath();
            const currentTheme = window.themeManager.getCurrentTheme();
            const themeConfig = window.themeManager.themesConfig?.themes[currentTheme];

            if (themeConfig) {
                const soundsPath = isNextJS
                    ? `/themes/${currentTheme}/sounds`  // Next.js: absolute path from public/
                    : `${basePath}/${themeConfig.basePath}/sounds`;
                return soundsPath;
            }
        }

        //Fallback to current structure
        //Detect theme by URL (same as preload-manager.js)
        const detectPageTheme = () => {
            return 'default';  // always use default theme
        };

        const urlBasedTheme = detectPageTheme();
        const savedTheme = localStorage.getItem('selectedTheme') || urlBasedTheme;

        //Next.js uses absolute paths from public folder
        if (isNextJS) {
            return `/themes/${savedTheme}/sounds`;
        }

        let basePath = `themes/${savedTheme}/sounds`;

        //Always use direct path to themes
        // (subfolder detection removed - only default theme exists)

        return basePath;
    }

    constructor() {
        //Main settings - now using only individual volumes
        this.musicEnabled = true;

        //Music tracks
        this.currentMusic = null;
        this.musicPaused = false;
        this.musicStates = new Map(); //Save states of all tracks

        //Mobile optimizations
        this.activeSounds = []; //Array of active sounds
        this.maxSimultaneousSounds = 30; //Limit of simultaneous sounds
        this.soundThrottle = new Map(); //Throttling for frequent sounds

        //Sound priorities (higher = more important)
        this.soundPriorities = {
            //Critical sounds (10)
            playerShoot: 10,
            wasted: 10,

            //High priority (8-9)
            playerOuch1: 9,   //Player pain sounds - IMPORTANT to hear!
            playerOuch2: 9,
            playerOof: 9,
            playerOogh: 9,
            buttonClick: 8,
            toasty: 8,        //Easter eggs
            cu: 8,

            //Boost sounds (8) - IMPORTANT! Player must hear boost activation
            boostDefault: 8,
            boostCoinShower: 8,
            boostAutoTarget: 8,
            boostGravityWell: 8,
            boostHealthBoost: 8,
            boostIceFreeze: 8,
            boostInvincibility: 8,
            boostMultiShot: 8,
            boostPiercingBullets: 8,
            boostPointsFreeze: 8,
            boostRapidFire: 8,
            boostRicochet: 8,
            boostScoreMultiplier: 8,
            boostShieldBarrier: 8,
            boostSpeedTamer: 8,
            boostWaveBlast: 8,

            //Low priority (frequent sounds - not critical)
            bossShoot: 6,
            bossHit: 3,        //Low priority
            crabDeath: 2       //Low priority
        };

        //Specific throttling timings for frequent sounds (reduced for better responsiveness)
        this.soundThrottleTimings = {
            playerShoot: 30,   //Minimal throttling for player shooting
            crabDeath: 50,     //Reduced
            bossHit: 80,       //Reduced
            bossShoot: 50      //Reduced
        };

        //Individual volume settings for each sound (0.0 - 1.0)
        this.soundVolumes = {
            //Music (reduced by 30%)
            menu: 0.1,
            tournamentLobby: 0.1,
            gameplay: 0.1,
            boss: 0.15,
            //Xmas theme music
            jinglebells: 0.25,
            lastchristmas: 0.25,

            //Player (reduced by 30%)
            playerShoot: 0.28,
            multiShot: 0.18,
            playerOuch1: 0.42,
            playerOuch2: 0.42,
            playerOof: 0.42,
            playerOogh: 0.42,

            //Enemies (reduced by 30%)
            crabDeath: 0.5,
            bossHit: 0.25,
            bossShoot: 0.28,

            //UI (reduced by 30%)
            buttonClick: 0.5,
            toasty: 0.6,
            cu: 0.6,
            wasted: 0.7,

            //Boosts (reduced by 30%)
            boostDefault: 0.4,
            boostCoinShower: 0.38,
            boostAutoTarget: 0.28,
            boostGravityWell: 0.35,
            boostHealthBoost: 0.38,
            boostIceFreeze: 0.4,
            boostInvincibility: 0.32,
            boostMultiShot: 0.4,
            boostPiercingBullets: 0.4,
            boostPointsFreeze: 0.34,
            boostRapidFire: 0.45,
            boostRicochet: 0.44,
            boostScoreMultiplier: 0.34,
            boostShieldBarrier: 0.38,
            boostSpeedTamer: 0.35,
            boostWaveBlast: 0.5
        };

        //Initialize sound paths
        this.initSoundPaths();

        //Loaded sounds
        this.loadedSounds = new Map();
        this.loadedMusic = new Map();

        //Sound state
        this.muted = false;
        this.enabled = true;

        //Mobile compatibility
        this.audioContext = null;
        this.unlocked = false;
        this.soundsLoaded = false;
        this.soundsLoadedPromise = null;

        this.init();

        //Listen for theme changes
        window.addEventListener('themeChanged', () => {
            this.initSoundPaths();
            //Clear loaded sounds cache to force reload
            this.loadedSounds.clear();
            this.loadedMusic.clear();
            //Reload sounds
            this.preloadSounds();
        });
    }

    //Initialize sound paths based on current theme
    initSoundPaths() {
        //Determine sound paths based on theme
        const soundsBasePath = this.detectSoundsPath();

        //Standard extensions for all devices
        const musicExt = 'mp3';
        const sfxExt = 'wav';
        const sfxMp3Ext = 'mp3';

        //Use default theme
        const currentTheme = window.themeManager?.getCurrentTheme() || localStorage.getItem('selectedTheme') || 'default';

        this.soundPaths = {
            music: {
                menu: `${soundsBasePath}/music/menu.${musicExt}`,
                tournamentLobby: `${soundsBasePath}/music/tournamentLobby.${musicExt}`,
                gameplay: `${soundsBasePath}/music/gameplay.${musicExt}`,
                boss: `${soundsBasePath}/music/boss.${musicExt}`
            },
            sfx: {
                //Player
                playerShoot: `${soundsBasePath}/sfx/player/shoot.${sfxExt}`,
                multiShot: `${soundsBasePath}/sfx/player/shoot2.${sfxExt}`,
                playerOuch1: `${soundsBasePath}/sfx/player/ouch_1.${sfxMp3Ext}`,
                playerOuch2: `${soundsBasePath}/sfx/player/ouch_2.${sfxMp3Ext}`,
                playerOof: `${soundsBasePath}/sfx/player/oof.${sfxMp3Ext}`,
                playerOogh: `${soundsBasePath}/sfx/player/oogh.${sfxMp3Ext}`,

                //Enemies
                crabDeath: `${soundsBasePath}/sfx/enemies/crab-death.${sfxExt}`,
                bossHit: `${soundsBasePath}/sfx/enemies/boss-hit.${sfxExt}`,
                bossShoot: `${soundsBasePath}/sfx/enemies/boss-shoot.${sfxMp3Ext}`,

                //UI
                buttonClick: `${soundsBasePath}/sfx/ui/button1.${sfxExt}`,
                toasty: `${soundsBasePath}/sfx/ui/toasty.${sfxExt}`,
                cu: `${soundsBasePath}/sfx/ui/CU.${sfxExt}`,
                wasted: `${soundsBasePath}/sfx/ui/WASTED.${sfxExt}`,

                //Boosts
                boostDefault: `${soundsBasePath}/sfx/boosts/default.${sfxExt}`,
                boostCoinShower: `${soundsBasePath}/sfx/boosts/coinShower.${sfxExt}`,
                boostAutoTarget: `${soundsBasePath}/sfx/boosts/Auto-Target.${sfxExt}`,
                boostGravityWell: `${soundsBasePath}/sfx/boosts/GravityWell.${sfxExt}`,
                boostHealthBoost: `${soundsBasePath}/sfx/boosts/HealthBoost.${sfxExt}`,
                boostIceFreeze: `${soundsBasePath}/sfx/boosts/IceFreeze.${sfxExt}`,
                boostInvincibility: `${soundsBasePath}/sfx/boosts/Invincibility.${sfxExt}`,
                boostMultiShot: `${soundsBasePath}/sfx/boosts/Multi-Shot.${sfxExt}`,
                boostPiercingBullets: `${soundsBasePath}/sfx/boosts/PiercingBullets.${sfxExt}`,
                boostPointsFreeze: `${soundsBasePath}/sfx/boosts/PointsFreeze.${sfxExt}`,
                boostRapidFire: `${soundsBasePath}/sfx/boosts/RapidFire.${sfxExt}`,
                boostRicochet: `${soundsBasePath}/sfx/boosts/Ricochet.${sfxExt}`,
                boostScoreMultiplier: `${soundsBasePath}/sfx/boosts/ScoreMultiplier.${sfxExt}`,
                boostShieldBarrier: `${soundsBasePath}/sfx/boosts/ShieldBarrier.${sfxExt}`,
                boostSpeedTamer: `${soundsBasePath}/sfx/boosts/timeFramer.${sfxExt}`,
                boostWaveBlast: `${soundsBasePath}/sfx/boosts/WaveBlast.${sfxExt}`
            }
        };

    }

    //INITIALIZATION
    async init() {
        try {
            //Create AudioContext for better compatibility (suspended by default to avoid autoplay warning)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            //Resume AudioContext on first user interaction
            if (this.audioContext.state === 'suspended') {
                console.log('🔇 AudioContext suspended by browser autoplay policy - will resume on user interaction');
            }

            //Load settings from localStorage
            this.loadSettings();

            //Load sounds BEFORE setting up handlers
            //This ensures sounds are ready for first interaction
            await this.preloadSounds();

            //Setup Page Visibility API handlers (iOS Safari fix)
            this.setupVisibilityHandlers();

            //Prepare mobile device handling
            this.setupMobileAudio();

        } catch (error) {
            Logger.error(' Sound Manager initialization failed:', error);
            this.enabled = false;
        }
    }

    //MOBILE AUDIO SETUP
    setupMobileAudio() {
        //Automatic unlock for all mobile devices
        let unlockAttempts = 0;
        const startTime = Date.now();

        const unlockAudio = async () => {
            //If already unlocked, exit
            if (this.unlocked) {
                return;
            }

            unlockAttempts++;

            //⏳ IMPORTANT: Wait for sounds to load
            if (!this.soundsLoaded) {
                //Check every 100ms for up to 5 seconds
                for (let i = 0; i < 50; i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (this.soundsLoaded) {
                        break;
                    }
                }

                if (!this.soundsLoaded) {
                    return; //DO NOT remove handlers
                }
            }

            try {
                //Method 1: AudioContext resume
                if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }

                //Wait a bit after resume
                await new Promise(resolve => setTimeout(resolve, 50));

                //Check that AudioContext is actually unlocked
                if (this.audioContext.state !== 'running') {
                    return; //DO NOT remove handlers
                }

                //Method 2: Play silence to unlock Web Audio API
                try {
                    const buffer = this.audioContext.createBuffer(1, 1, 22050);
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    source.start(0);
                } catch (err) {
                    //Ignore errors
                }

                //All successful - mark as unlocked
                this.unlocked = true;

                //Update music button state after unlock
                setTimeout(() => {
                    const button = document.getElementById('musicToggleBtn');
                    if (button && !this.currentMusic) {
                        button.innerHTML = ' OFF';
                        button.style.background = 'rgba(255,100,100,0.2)';
                        button.style.borderColor = 'rgba(255,100,100,0.5)';
                    }
                    //In tournament mode automatically start lobby music
                    if ((window.tournamentMode || typeof tournamentMode !== 'undefined' && tournamentMode) && !this.currentMusic) {
                        setTimeout(() => {
                            this.playMusic('tournamentLobby', true);
                        }, 200);
                    }
                }, 100);

                //Remove handlers only if successfully unlocked
                this.removeUnlockListeners(unlockAudio);

            } catch (error) {
                //On error DO NOT remove handlers - will try on next interaction
            }
        };

        //Save reference for possible removal
        this._unlockAudioHandler = unlockAudio;

        //Add handlers for audio unlock (NOT once, will remove manually)
        document.addEventListener('touchstart', unlockAudio, { passive: true });
        document.addEventListener('touchend', unlockAudio, { passive: true });
        document.addEventListener('mousedown', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('click', unlockAudio);
    }

    //Remove unlock handlers
    removeUnlockListeners(handler) {
        document.removeEventListener('touchstart', handler);
        document.removeEventListener('touchend', handler);
        document.removeEventListener('mousedown', handler);
        document.removeEventListener('keydown', handler);
        document.removeEventListener('click', handler);
    }

    //ENSURE AUDIOCONTEXT IS RUNNING
    async ensureContextRunning() {
        if (!this.audioContext) {
            throw new Error('AudioContext not initialized');
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        return this.audioContext.state === 'running';
    }

    //SETUP PAGE VISIBILITY HANDLERS (iOS Safari fix)
    setupVisibilityHandlers() {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                this.handlePageHide();
            } else {
                this.handlePageShow();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', () => this.handlePageHide());
        window.addEventListener('pageshow', () => this.handlePageShow());
    }

    handlePageHide() {
        console.log('🔇 Page hidden - stopping all sounds');

        //CRITICAL: Stop ALL active sounds to prevent accumulation
        for (const source of this.activeSounds) {
            try {
                source.stop();
                source.disconnect();
            } catch (e) {
                //Ignore errors for already stopped sources
            }
        }
        this.activeSounds = [];

        //Suspend AudioContext
        if (this.audioContext?.state === 'running') {
            this.audioContext.suspend();
        }
    }

    handlePageShow() {
        console.log('🔊 Page shown - resuming AudioContext');

        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    //FORCED AUDIO UNLOCK (called by button)
    async forceUnlockAudio() {
        try {
            //1. Unlock AudioContext with await
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            //Verify AudioContext is running
            if (this.audioContext.state !== 'running') {
                console.warn('AudioContext not running after resume');
                return false;
            }

            //2. Play silent buffer to unlock Web Audio API
            try {
                const buffer = this.audioContext.createBuffer(1, 1, 22050);
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioContext.destination);
                source.start(0);
            } catch (err) {
                //Ignore errors
            }

            //3. Mark as unlocked
            this.unlocked = true;

            //4. Remove automatic handlers
            if (this._unlockAudioHandler) {
                this.removeUnlockListeners(this._unlockAudioHandler);
            }

            console.log('✅ Audio unlocked successfully');
            return true;

        } catch (error) {
            console.error('Error unlocking audio:', error);
            this.unlocked = true;
            return true;
        }
    }

    //Load sound (Web Audio API)
    async loadSound(key, path, isMusic = false) {
        if (!this.enabled) return null;

        try {
            //Fetch audio file
            const response = await fetch(path);
            if (!response.ok) {
                console.warn(`Failed to fetch ${key}: ${response.status}`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();

            //Decode into AudioBuffer
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            //Store decoded buffer
            if (isMusic) {
                this.loadedMusic.set(key, audioBuffer);
            } else {
                this.loadedSounds.set(key, audioBuffer);
            }

            console.log(`✅ Loaded sound: ${key}`);
            return audioBuffer;

        } catch (error) {
            console.error(`Error loading ${key}:`, error);
            return null;
        }
    }

    //PRELOAD SOUNDS
    async preloadSounds() {
        if (!this.enabled) {
            this.soundsLoaded = true;
            return;
        }

        const loadPromises = [];

        //Load music - DISABLED (music is off; only sound effects are loaded)
        // for (const [key, path] of Object.entries(this.soundPaths.music)) {
        //     loadPromises.push(this.loadSound(key, path, true));
        // }

        //Load sound effects
        for (const [key, path] of Object.entries(this.soundPaths.sfx)) {
            loadPromises.push(this.loadSound(key, path, false));
        }

        //Load ambient sounds (if available)
        if (this.soundPaths.ambient) {
            for (const [key, path] of Object.entries(this.soundPaths.ambient)) {
                loadPromises.push(this.loadSound(key, path, false));
            }
        }

        try {
            await Promise.all(loadPromises);
            this.soundsLoaded = true;
        } catch (error) {
            Logger.error(' Error preloading sounds:', error);
            this.soundsLoaded = true; //Mark as loaded to not block
        }
    }

    //PLAY MUSIC WITH CROSSFADE - DISABLED (music is off)
    playMusic(track, fadeIn = false, crossfade = false) {
        //MUSIC DISABLED - sound effects only
        return;

        if (!this.enabled || this.muted || !this.musicEnabled) {
            return;
        }

        //Resume AudioContext if suspended (Chrome autoplay policy)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => {
                console.warn('AudioContext resume failed:', err);
            });
        }

        // Use standard menu track (no theme-specific logic)

        const music = this.loadedMusic.get(track);
        if (!music) {
            return;
        }

        //if already playing this same track, do nothing
        if (this.currentMusic === music && !music.paused) {
            return;
        }

        //Save state of current track
        if (this.currentMusic && !this.currentMusic.paused) {
            const currentTrackName = this.getCurrentTrackName();
            if (currentTrackName) {
                this.musicStates.set(currentTrackName, {
                    currentTime: this.currentMusic.currentTime,
                    volume: this.currentMusic.volume
                });
            }
        }

        //Crossfade: smoothly fade out old track
        if (crossfade && this.currentMusic && !this.currentMusic.paused) {
            this.fadeOut(this.currentMusic, 1000);
        } else if (this.currentMusic) {
            //Normal stop without crossfade
            this.currentMusic.pause();
        }

        //Restore state of new track
        const savedState = this.musicStates.get(track);
        if (savedState) {
            music.currentTime = savedState.currentTime;
        } else {
            music.currentTime = 0;
        }

        this.currentMusic = music;

        //Use individual volume for this track
        const individualVolume = this.getSoundVolume(track);
        music.volume = fadeIn ? 0 : individualVolume;

        //Start playback
        const playPromise = music.play();

        if (playPromise !== undefined) {
            playPromise.then(() => {
                if (fadeIn) {
                    this.fadeIn(music, individualVolume, 1000);
                }
            }).catch(error => {
                //music may be blocked by autoplay policy
                //User can manually enable via music button
            });
        }
    }

    //GET INDIVIDUAL SOUND VOLUME
    getSoundVolume(trackName) {
        return this.soundVolumes[trackName] || 1.0; //by default 100% if not configured
    }

    //GET CURRENT TRACK NAME
    getCurrentTrackName() {
        if (!this.currentMusic) return null;

        for (const [trackName, audio] of this.loadedMusic.entries()) {
            if (audio === this.currentMusic) {
                return trackName;
            }
        }
        return null;
    }

    //PLAY SOUND EFFECT (Web Audio API)
    async playSound(effect, volume = 1.0, pitch = 1.0) {
        if (!this.enabled || this.muted || !this.soundsLoaded) {
            return;
        }

        //1. Ensure AudioContext is running
        const contextReady = await this.ensureContextRunning();
        if (!contextReady) {
            console.warn('AudioContext not ready:', effect);
            return;
        }

        //2. Get AudioBuffer
        const buffer = this.loadedSounds.get(effect);
        if (!buffer) {
            console.warn(`Sound "${effect}" not found`);
            return;
        }

        //3. Throttling (existing logic)
        const now = Date.now();
        const throttleTime = this.soundThrottleTimings[effect];
        if (throttleTime) {
            const lastPlayed = this.soundThrottle.get(effect);
            if (lastPlayed && (now - lastPlayed) < throttleTime) {
                return;
            }
            this.soundThrottle.set(effect, now);
        }

        //4. Clean finished sounds
        this.activeSounds = this.activeSounds.filter(s => {
            //Check if source is still playing (not in 'finished' state)
            //AudioBufferSourceNode doesn't have playbackState, so we filter by existence
            return s && s.context && s.context.state !== 'closed';
        });

        //5. Limit simultaneous sounds
        if (this.activeSounds.length >= this.maxSimultaneousSounds) {
            const oldestSound = this.activeSounds.shift();
            if (oldestSound) {
                try {
                    oldestSound.stop();
                    oldestSound.disconnect();
                } catch (e) {
                    //Ignore errors for already stopped sources
                }
            }
        }

        try {
            //6. Create AudioBufferSourceNode
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;

            //7. Set playback rate (pitch)
            if (pitch !== 1.0) {
                source.playbackRate.value = pitch;
            }

            //8. Create GainNode for volume
            const gainNode = this.audioContext.createGain();
            const individualVolume = this.getSoundVolume(effect);
            const finalVolume = Math.min(1.0, volume * individualVolume);
            gainNode.gain.value = finalVolume;

            //9. Connect: source → gain → destination
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            //10. Auto-cleanup
            source.onended = () => {
                const index = this.activeSounds.indexOf(source);
                if (index !== -1) {
                    this.activeSounds.splice(index, 1);
                }
                try {
                    source.disconnect();
                    gainNode.disconnect();
                } catch (e) {
                    //Ignore disconnect errors
                }

                //SPECIAL HANDLING: After wasted sound start menu music
                if (effect === 'wasted') {
                    setTimeout(() => {
                        this.playMusic('menu', true);
                    }, 500);
                }
            };

            //11. SCHEDULING: start slightly in future (iOS best practice)
            const startTime = this.audioContext.currentTime + 0.001;
            source.start(startTime);

            //12. Track active sound
            source._priority = this.soundPriorities[effect] || 5;
            this.activeSounds.push(source);

            //Diagnostics for critical sounds
            if (effect === 'playerShoot' || effect === 'wasted') {
                console.log(`🔊 Playing ${effect}, context state: ${this.audioContext.state}, time: ${this.audioContext.currentTime.toFixed(3)}`);
            }

        } catch (error) {
            console.error(`Error playing ${effect}:`, error);
        }
    }

    //PLAY BOOST SOUND WITH FALLBACK
    playBoostSound(boostName, volume = 0.7, pitch = 1.0) {
        if (!this.enabled || this.muted) return;

        //Convert boost name to sound key format
        const specificSoundKey = `boost${boostName.charAt(0).toUpperCase()}${boostName.slice(1)}`;

        //Check if there's a specific sound for this boost
        if (this.loadedSounds.has(specificSoundKey)) {
            this.playSound(specificSoundKey, volume, pitch);
        } else {
            //Use generic boost sound
            this.playSound('boostDefault', volume, pitch);
        }
    }

    //PLAY RANDOM PLAYER HURT SOUND
    playRandomHurtSound(volume = 0.6, pitch = 1.0) {
        if (!this.enabled || this.muted) return;

        //array of all hurt sounds
        const hurtSounds = ['playerOuch1', 'playerOuch2', 'playerOof', 'playerOogh'];

        //Select random sound
        const randomSound = hurtSounds[Math.floor(Math.random() * hurtSounds.length)];

        //Play selected sound
        this.playSound(randomSound, volume, pitch);
    }

    //FADE IN SOUND
    fadeIn(audio, targetVolume, duration) {
        const startVolume = 0;
        const volumeStep = targetVolume / (duration / 50);
        let currentVolume = startVolume;

        const fadeInterval = setInterval(() => {
            currentVolume += volumeStep;
            if (currentVolume >= targetVolume) {
                currentVolume = targetVolume;
                clearInterval(fadeInterval);
            }
            audio.volume = currentVolume;
        }, 50);
    }

    //FADE OUT SOUND
    fadeOut(audio, duration, pauseAtEnd = true) {
        const startVolume = audio.volume;
        const volumeStep = startVolume / (duration / 50);
        let currentVolume = startVolume;

        const fadeInterval = setInterval(() => {
            currentVolume -= volumeStep;
            if (currentVolume <= 0) {
                currentVolume = 0;
                if (pauseAtEnd) {
                    audio.pause();
                    //DON'T reset currentTime for crossfade
                }
                clearInterval(fadeInterval);
            }
            audio.volume = currentVolume;
        }, 50);
    }

    //⏹ STOP MUSIC
    stopMusic(fadeOut = false) {
        if (!this.currentMusic) return;

        if (fadeOut) {
            this.fadeOut(this.currentMusic, 1000);
        } else {
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
        }

        this.currentMusic = null;
    }

    //⏸ PAUSE/RESUME MUSIC
    pauseMusic() {
        if (this.currentMusic && !this.musicPaused) {
            this.currentMusic.pause();
            this.musicPaused = true;
        }
    }

    resumeMusic() {
        if (this.currentMusic && this.musicPaused) {
            this.currentMusic.play();
            this.musicPaused = false;
        }
    }

    //SOUND CONTROL
    mute() {
        this.muted = true;
        if (this.currentMusic) {
            this.currentMusic.volume = 0;
        }
        this.saveSettings();
    }

    unmute() {
        this.muted = false;
        if (this.currentMusic) {
            const individualVolume = this.getSoundVolume(this.currentMusic.dataset?.track || 'menu');
            this.currentMusic.volume = individualVolume;
        }
        this.saveSettings();
    }

    toggleMute() {
        if (this.muted) {
            this.unmute();
        } else {
            this.mute();
        }
    }

    //UPDATE CURRENT MUSIC VOLUME
    updateCurrentMusicVolume() {
        if (this.currentMusic) {
            const track = this.currentMusic.dataset?.track || 'menu';
            const individualVolume = this.getSoundVolume(track);
            this.currentMusic.volume = individualVolume;
        }
    }

    //SET INDIVIDUAL SOUND VOLUME
    setSoundVolume(soundName, volume) {
        this.soundVolumes[soundName] = Math.max(0, Math.min(1, volume));
        this.saveSettings();
        this.updateCurrentMusicVolume(); //Update volume if changing current track
    }

    //SAVE SETTINGS
    saveSettings() {
        const settings = {
            musicEnabled: this.musicEnabled,
            muted: this.muted,
            soundVolumes: this.soundVolumes //Save individual volumes
        };
        localStorage.setItem('seaInvadersSoundSettings', JSON.stringify(settings));
    }

    //LOAD SETTINGS
    loadSettings() {
        try {
            const saved = localStorage.getItem('seaInvadersSoundSettings');
            if (saved) {
                const settings = JSON.parse(saved);
                this.musicEnabled = settings.musicEnabled !== false;
                this.muted = settings.muted || false;

                //Load individual volume settings
                if (settings.soundVolumes) {
                    //Merge saved settings with defaults
                    this.soundVolumes = { ...this.soundVolumes, ...settings.soundVolumes };
                }
            }
        } catch (error) {
            Logger.error(' Error loading sound settings:', error);
        }
    }

    //GET INFORMATION
    getStatus() {
        return {
            enabled: this.enabled,
            musicEnabled: this.musicEnabled,
            muted: this.muted,
            currentMusic: this.currentMusic ? 'playing' : 'none',
            individualVolumes: this.soundVolumes,
            loadedSounds: this.loadedSounds.size,
            loadedMusic: this.loadedMusic.size
        };
    }

    //Cleanup
    destroy() {
        this.stopMusic();
        this.loadedSounds.clear();
        this.loadedMusic.clear();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

//Create global instance
window.soundManager = new SoundManager();

//Global functions for testing (can use in console)
window.setSoundVolume = (soundName, volume) => {
    if (window.soundManager) {
        window.soundManager.setSoundVolume(soundName, volume);
    }
};

window.getSoundStatus = () => {
    if (window.soundManager) {
        console.table(window.soundManager.soundVolumes);
        return window.soundManager.getStatus();
    }
};

//Global function for buttons
window.playButtonSound = () => {
    if (window.soundManager) {
        window.soundManager.playSound('buttonClick');
    }
};

//Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SoundManager;
}
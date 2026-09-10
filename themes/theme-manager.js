//THEME MANAGER - Centralized theme management
class ThemeManager {
    constructor() {
        //STATIC VERSION - increment manually when assets change
        this.VERSION = '20251120002';

        this.currentTheme = 'default';
        this.themesConfig = null;
        this.resourceCache = new Map(); //Cache for loaded resources
        this.loadingPromises = new Map(); //Loading promises
        this.isInitialized = false;

        //PAGE PRESETS - on string for with withand
        this.pagePresets = {
            'index': 'xmas',           //on game → Xmas theme
            'tournament-lobby': 'xmas', //tournament → Xmas theme
            'coraluna': 'coraluna'        //Coraluna → coraluna theme
        };

        //to withand inandwithtoand
        this.currentPage = this._detectCurrentPage();
    }

    //Load themes configuration
    async loadThemesConfig() {
        try {
            const basePath = this._detectBasePath();
            const configPath = `${basePath}/themes/themes-config.json`;

            const response = await fetch(configPath + '?v=' + this.VERSION);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.themesConfig = await response.json();

            //inandwithto withbutinto for withand
            //preset for to withand
            const pagePreset = this.getPagePreset();

            //inwithyes pagePreset for toto withand
            //and, index and tournament inwithyes default
            this.currentTheme = pagePreset;

            this.isInitialized = true;

            //inandwithtoand Setting background
            this.setBackground();

            //Sending event with SoundManager and soundand
            window.dispatchEvent(new CustomEvent('themeChanged', {
                detail: { theme: this.currentTheme }
            }));

            return true;
        } catch (error) {
            console.error(' Theme Manager: Failed to load themes configuration:', error);
            this.currentTheme = 'default';
            this.isInitialized = false;
            return false;
        }
    }

    //Switch theme
    async switchTheme(themeName) {
        if (!this.themesConfig?.themes[themeName]) {
            console.error(` Theme Manager: Theme "${themeName}" not found!`);
            return false;
        }

        this.currentTheme = themeName;

        //Clear resource cache on theme change
        this.resourceCache.clear();
        this.loadingPromises.clear();

        //Save selection to localStorage
        localStorage.setItem('selectedTheme', themeName);

        //Update config
        if (this.themesConfig) {
            this.themesConfig.currentTheme = themeName;
        }

        //Set new background
        this.setBackground();

        //Dispatch theme change event
        window.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: themeName }
        }));

        return true;
    }

    //withbutinto background withand
    setBackground() {
        if (!this.isInitialized || !this.themesConfig) {
            //Fallback if theme manager NOT andandandfromandin
            document.body.style.backgroundImage = "url('/themes/default/images/bgmain2.webp?v=20251025')";
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.backgroundRepeat = 'no-repeat';
            return;
        }

        //Getting path to background from
        const bgPath = this.getImagePath('ui', 'bgmain2');

        //Setting background
        document.body.style.backgroundImage = `url('${bgPath}?v=${this.VERSION}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundRepeat = 'no-repeat';
    }

    //Get image path
    getImagePath(category, name) {
        if (!this.isInitialized || !this.themesConfig) {
            //Fallback to old structure
            return this._getFallbackImagePath(category, name);
        }

        const theme = this.themesConfig.themes[this.currentTheme];
        if (!theme) {
            console.warn(` Theme Manager: Theme ${this.currentTheme} not found`);
            return this._getFallbackImagePath(category, name);
        }

        //Navigate nested structure
        let path = null;
        if (category.includes('.')) {
            //Support nested paths: "images.player.front"
            const parts = category.split('.');
            let current = theme;
            for (const part of parts) {
                current = current?.[part];
                if (!current) break;
            }
            path = current?.[name];
        } else {
            //with path: category = "player", name = "front"
            path = theme.images?.[category]?.[name];
        }

        if (!path) {
 console.warn(` Theme Manager: fromand not found: ${category}.${name} in ${this.currentTheme}`);
            return this._getFallbackImagePath(category, name);
        }

        const basePath = this._detectBasePath();
        return `${basePath}/${theme.basePath}/${path}`;
    }

    //Getting path to sound
    getSoundPath(category, name) {
        if (!this.isInitialized || !this.themesConfig) {
            return this._getFallbackSoundPath(category, name);
        }

        const theme = this.themesConfig.themes[this.currentTheme];
        if (!theme) {
 console.warn(` Theme Manager: ${this.currentTheme} NOT onon`);
            return this._getFallbackSoundPath(category, name);
        }

        const path = theme.sounds?.[category]?.[name];
        if (!path) {
 console.warn(` Theme Manager: into NOT on: ${category}.${name} in ${this.currentTheme}`);
            return this._getFallbackSoundPath(category, name);
        }

        const basePath = this._detectBasePath();
        return `${basePath}/${theme.basePath}/${path}`;
    }

    //Loading fromand with cacheandinand
    async loadImage(category, name) {
        const cacheKey = `${this.currentTheme}:img:${category}:${name}`;

        //Checking cache
        if (this.resourceCache.has(cacheKey)) {
            return this.resourceCache.get(cacheKey);
        }

        //Checking, NOT with and
        if (this.loadingPromises.has(cacheKey)) {
            return this.loadingPromises.get(cacheKey);
        }

        //Creating toand
        const loadPromise = new Promise((resolve, reject) => {
            const img = new Image();
            const path = this.getImagePath(category, name);

            img.onload = () => {
                this.resourceCache.set(cacheKey, img);
                this.loadingPromises.delete(cacheKey);
                resolve(img);
            };

            img.onerror = () => {
 console.error(` Theme Manager: NOT yeswith Load fromand: ${path}`);
                this.loadingPromises.delete(cacheKey);
                reject(new Error(`Failed to load image: ${path}`));
            };

            img.src = path + '?v=' + this.VERSION; //Cache busting
        });

        this.loadingPromises.set(cacheKey, loadPromise);
        return loadPromise;
    }

    //Getting withto towith
    getAvailableThemes() {
        if (!this.themesConfig) return ['default'];
        return Object.keys(this.themesConfig.themes);
    }

    //Getting andformandand
    getThemeInfo(themeName) {
        if (!this.themesConfig) return null;
        const theme = this.themesConfig.themes[themeName];
        if (!theme) return null;

        return {
            name: theme.name,
            description: theme.description || '',
            basePath: theme.basePath
        };
    }

    //Getting to
    getCurrentTheme() {
        return this.currentTheme;
    }

    //and in path (andin tournament mode)
    _detectBasePath() {
        const currentPath = window.location.pathname;
        if (currentPath.includes('/tournament/') || currentPath.includes('\\tournament\\')) {
            return '..';
        }
        if (currentPath.includes('/coraluna/') || currentPath.includes('\\coraluna\\')) {
            return '..';
        }
        if (currentPath.includes('/xmas/') || currentPath.includes('\\xmas\\')) {
            return '..';
        }
        return '.';
    }

    //and to withand
    _detectCurrentPage() {
        const path = window.location.pathname;

        if (path.includes('coraluna.html') || path.includes('/coraluna')) {
            return 'coraluna';
        }
        if (path.includes('tournament-lobby.html') || path.includes('/tournament')) {
            return 'tournament-lobby';
        }
        if (path.includes('index.html') || path === '/' || path.endsWith('/')) {
            return 'index';
        }

        //by default - index
        return 'index';
    }

    //Get preset for to withand
    getPagePreset() {
        return this.pagePresets[this.currentPage] || 'default';
    }

    //Fallback method for but withinwithandwithand
    _getFallbackImagePath(category, name) {
        //inin path to butin withto themes/default/ (PNG format)
        const basePath = this._detectBasePath();
        const paths = {
            'player': `${basePath}/themes/default/images/${name}.png`,
            'enemies': `${basePath}/themes/default/images/${name}.png`,
            'boosts': `${basePath}/themes/default/images/boosts/${name}.png`,
            'ui': `${basePath}/themes/default/images/${name}.png`,
            'boss': `${basePath}/themes/default/images/${name}.png`
        };
        return paths[category] || `${basePath}/themes/default/images/${name}.png`;
    }

    _getFallbackSoundPath(category, name) {
        const basePath = this._detectBasePath();
        return `${basePath}/themes/default/sounds/${category}/${name}`;
    }

    //Clearing cache
    clearCache() {
        this.resourceCache.clear();
        this.loadingPromises.clear();
    }

    //Getting withandtoand cache
    getCacheStats() {
        return {
            cachedResources: this.resourceCache.size,
            loadingResources: this.loadingPromises.size,
            currentTheme: this.currentTheme,
            isInitialized: this.isInitialized
        };
    }
}

//Creating global instance
if (!window.themeManager) {
    window.themeManager = new ThemeManager();
}

//SERVICE CONTAINER
//Dependency Injection toNOT for inand inandwithand

class ServiceContainer {
    constructor() {
        this.services = new Map();
        this.singletons = new Map();
        this.aliases = new Map();
    }

    //========================================
    //registration withinin
    //========================================

    /**
     * registration within
     * @param {string} name - and within
     * @param {Function} factory - andto for creation within
     * @param {Object} options - options { singleton: boolean, aliases: string[] }
     */
    register(name, factory, options = {}) {
        const { singleton = false, aliases = [] } = options;

        this.services.set(name, {
            factory: factory,
            singleton: singleton
        });

        //registering andwith
        aliases.forEach(alias => {
            this.aliases.set(alias, name);
        });

        return this;
    }

    /**
     * registration singleton within
     */
    registerSingleton(name, factory, options = {}) {
        return this.register(name, factory, { ...options, singleton: true });
    }

    /**
     * registration instance ondirect
     */
    registerInstance(name, instance, options = {}) {
        this.singletons.set(name, instance);

        //registering andwith
        const { aliases = [] } = options;
        aliases.forEach(alias => {
            this.aliases.set(alias, name);
        });

        return this;
    }

    //========================================
    //Getting withinin
    //========================================

    /**
     * Get within
     * @param {string} name - and within
     * @returns {any} to within
     */
    get(name) {
        //Checking andwith
        const actualName = this.aliases.get(name) || name;

        //if with fromin singleton
        if (this.singletons.has(actualName)) {
            return this.singletons.get(actualName);
        }

        //Getting and within
        const service = this.services.get(actualName);
        if (!service) {
            throw new Error(`Service '${name}' not registered`);
        }

        //Creating new instance
        try {
            const instance = service.factory(this);

            //if singleton - Saving
            if (service.singleton) {
                this.singletons.set(actualName, instance);
            }

            return instance;
        } catch (error) {
            throw new Error(`Failed to create service '${name}': ${error.message}`);
        }
    }

    /**
     * Get NOTwithtoto withinin
     */
    getMultiple(...names) {
        return names.map(name => this.get(name));
    }

    /**
     * inand onandand within
     */
    has(name) {
        const actualName = this.aliases.get(name) || name;
        return this.services.has(actualName) || this.singletons.has(actualName);
    }

    //========================================
    //LAZY LOADING
    //========================================

    /**
     * Create andin withwithto on within
     */
    lazy(name) {
        return () => this.get(name);
    }

    //========================================
    //inand
    //========================================

    /**
     * Delete within
     */
    remove(name) {
        const actualName = this.aliases.get(name) || name;

        this.services.delete(actualName);
        this.singletons.delete(actualName);

        //Deleting andwith
        for (const [alias, target] of this.aliases.entries()) {
            if (target === actualName) {
                this.aliases.delete(alias);
            }
        }

        return this;
    }

    /**
     * Clear inwith singleton instance
     */
    clearSingletons() {
        this.singletons.clear();
        return this;
    }

    /**
     * on Clearing toNOT
     */
    clear() {
        this.services.clear();
        this.singletons.clear();
        this.aliases.clear();
        return this;
    }

    //========================================
    //or
    //========================================

    /**
     * Get withto inwith andin withinin
     */
    getRegisteredServices() {
        return Array.from(this.services.keys());
    }

    /**
     * Get withto inwith singleton instancein
     */
    getSingletonInstances() {
        return Array.from(this.singletons.keys());
    }

    /**
     * Get andformand  within
     */
    getServiceInfo(name) {
        const actualName = this.aliases.get(name) || name;
        const service = this.services.get(actualName);

        if (!service) {
            return null;
        }

        return {
            name: actualName,
            singleton: service.singleton,
            instantiated: this.singletons.has(actualName),
            aliases: Array.from(this.aliases.entries())
                .filter(([_, target]) => target === actualName)
                .map(([alias]) => alias)
        };
    }

    /**
     * ininwithand from in towith
     */
    debug() {
        console.group(' Service Container Debug');

        console.group('Service Details:');
        this.getRegisteredServices().forEach(name => {
        });
        console.groupEnd();

        console.groupEnd();
    }
}

//Creating global toNOT
window.container = new ServiceContainer();

//========================================
//registration in withinin
//========================================

//State Manager
container.registerSingleton('stateManager', () => {
    if (!window.StateManager) {
        throw new Error('StateManager class not loaded');
    }
    return window.stateManager || new StateManager();
});

//Error Boundary
container.registerSingleton('errorBoundary', () => {
    if (!window.ErrorBoundary) {
        throw new Error('ErrorBoundary class not loaded');
    }
    return window.errorBoundary || new ErrorBoundary();
});

//Logger
container.registerSingleton('logger', () => {
    if (!window.Logger) {
        throw new Error('Logger class not loaded');
    }
    return window.logger || new Logger();
});

//Sound Manager
container.registerSingleton('soundManager', () => {
    if (!window.SoundManager) {
        throw new Error('SoundManager not loaded');
    }
    return window.soundManager;
});

//Performance Optimizer
container.registerSingleton('performanceOptimizer', () => {
    if (!window.PerformanceOptimizer) {
        throw new Error('PerformanceOptimizer not loaded');
    }
    return window.performanceOptimizer;
});

//Performance Monitor
container.registerSingleton('performanceMonitor', () => {
    if (!window.PerformanceMonitor) {
        throw new Error('PerformanceMonitor not loaded');
    }
    return window.performanceMonitor;
});

//Boost Manager
container.registerSingleton('boostManager', (c) => {
    if (!window.BoostManager) {
        throw new Error('BoostManager not loaded');
    }

    //if withyes global instance
    if (window.boostManager) {
        return window.boostManager;
    }

    //Creating new with inandwithand
    const stateManager = c.get('stateManager');
    const errorBoundary = c.get('errorBoundary');

    const manager = new BoostManager();
    manager._stateManager = stateManager;
    manager._errorBoundary = errorBoundary;

    window.boostManager = manager;
    return manager;
});

//Boost Effects
container.registerSingleton('boostEffects', () => {
    if (!window.boostEffects) {
        throw new Error('BoostEffects not loaded');
    }
    return window.boostEffects;
});

//Boss System
container.registerSingleton('bossSystem', () => {
    if (!window.BossSystem) {
        throw new Error('BossSystem not loaded');
    }
    return window.bossSystem || new BossSystem();
});

//towithand
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServiceContainer;
}

//SEA INVADERS - GAME CONSTANTS
//inwith towith game (andNOT from withwithinand filein)

//MOBILE DETECTION
export const isMobileDevice = (function() {
    const ua = navigator.userAgent.toLowerCase();
    const isMobileUA = /iphone|ipad|ipod|android|webos|blackberry|iemobile|opera mini/.test(ua);
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    const isRealMobile = isMobileUA && hasTouch && isSmallScreen;

    return isRealMobile;
})();

//PERFORMANCE SETTINGS - ALL FEATURES ENABLED FOR ALL DEVICES
export const PERFORMANCE_SETTINGS = {
    particleMultiplier: 1.0,  // Full particle effects
    shadowsEnabled: true,     // Shadows enabled
    glowEnabled: true,        // Glow effects enabled
    trailLength: 6,           // Full trail length
    maxParticles: 100         // Maximum particles
};

//GAME CONSTANTS (from game-constants.js)
export const GAME_CONSTANTS = {
    //frominandbutwith and FPS
    TARGET_FPS: 60,
    MAX_GAME_EVENT_LOG: 100,

    //player
    PLAYER: {
        WIDTH: 98,
        HEIGHT: 98,
        SPEED: 10,
        SHOT_COOLDOWN: 300,
        BULLET_SPEED: 16
    },

    //score and points
    SCORING: {
        //in points toin (1 level)
        BASE_SCORES: {
            ROW_1: 30,  //🟢 to - andand
            ROW_2: 70,  //withandand to
            ROW_3: 100, //🟡 to
            ROW_4: 130, //towith to
            ROW_5: 170  //🟣 andin to - inand
        },

        //toandand for inNOT (NOT boss inand: 1,2,4,5,7,8,10,11,13,14)
        LEVEL_MULTIPLIERS: {
            1: 1.0,
            2: 1.1,
            4: 1.2,
            5: 1.3,
            7: 1.4,
            8: 1.5,
            10: 1.6,
            11: 1.7,
            13: 1.8,
            14: 1.9
        },

        //parameter inbut and toin
        DECAY_INTERVAL: 1700, //1.7 seconds in andtoyes
        DECAY_RATE: 0.01,     //1% interval
        MIN_PERCENTAGE: 0.01,  //andand 1% from towithandbut onand

        //towithand points level (withwithandbut for 5 toin 10 toin to)
        MAX_LEVEL_SCORES: {
            1: 5000,  //(170+130+100+70+30) * 10 = 5000
            2: 5500,  //5000 * 1.1 = 5500
            3: 10000, //boss level
            4: 6000,  //5000 * 1.2 = 6000
            5: 6500,  //5000 * 1.3 = 6500
            6: 20000, //boss level
            7: 7000,  //5000 * 1.4 = 7000
            8: 7500,  //5000 * 1.5 = 7500
            9: 30000, //boss level
            10: 8000, //5000 * 1.6 = 8000
            11: 8500, //5000 * 1.7 = 8500
            12: 40000, //boss level
            13: 9000, //5000 * 1.8 = 9000
            14: 9500, //5000 * 1.9 = 9500
            15: 50000  //boss level
        }
    },

    //bullets toin
    CRAB_BULLETS: {
        SPEED: 2.5,
        BASE_FIRE_RATE: 0.0008,
        CONFIG_DIVIDER: 100
    },

    //UI and animation
    UI: {
        BUBBLE_INTERVAL: 500,
        BUBBLE_TIMEOUT: 8000,
        BUBBLE_MAX_SIZE: 20,
        BUBBLE_MIN_SIZE: 10,
        BUBBLE_MAX_DELAY: 2
    },

    //with
    TIMEOUTS: {
        TOURNAMENT_CHECK: 1000
    }
};

//in towith
GAME_CONSTANTS.FRAME_TIME = 1000 / GAME_CONSTANTS.TARGET_FPS;

//toand towith
export const MAX_LIVES = 100;

//TIMER CONSTANTS
export const TIMER_CONSTANTS = {
    SHOT_COOLDOWN: 250,
    HURT_DURATION: 500
};

//RENDERING CONSTANTS
export const RENDER_CONSTANTS = {
    PLAYER_SHADOW_BLUR: 20,
    CRAB_SHADOW_BLUR: 15
};

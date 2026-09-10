//BOOST CONSTANTS
//All boost constants for convenient configuration

const BOOST_CONSTANTS = {
    //⏱ Default duration of boosts (in milliseconds)
    DURATIONS: {
        RAPID_FIRE: 10000,      //10 seconds
        SHIELD_BARRIER: -1,     //Active until broken
        SCORE_MULTIPLIER: 10000, //10 seconds
        POINTS_FREEZE: 10000,   //10 seconds
        MULTI_SHOT: 10000,      //10 seconds
        HEALTH_BOOST: 0,        //Instant effect
        PIERCING_BULLETS: 10000, //10 seconds
        INVINCIBILITY: 10000,   //10 seconds
        GRAVITY_WELL: 10000,    //10 seconds
        RICOCHET: 10000,        //10 seconds
        RANDOM_CHAOS: [10000, 15000], //10-15 seconds (random)
        ICE_FREEZE: 10000,      //10 seconds
        AUTO_TARGET: 7770,      //7.77 seconds
        COIN_SHOWER: 0,         //Instant effect
        WAVE_BLAST: 0,          //Instant effect
        SPEED_TAMER: -1,        //Forever
        SCREAM: 0,              //Instant effect (Easter Egg)
        KNIFE: 0                //Instant effect (Ghost Attack)
    },

    //Boost effect parameters
    EFFECTS: {
        RAPID_FIRE: {
            multiplier: 2           //Increase fire rate by 2x
        },
        SHIELD_BARRIER: {
            hits: 3                 //Blocks 3 hits
        },
        SCORE_MULTIPLIER: {
            multiplier: 2           //Doubles points
        },
        MULTI_SHOT: {
            bullets: 3              //3 bullets simultaneously
        },
        HEALTH_BOOST: {
            heal: 1                 //Restores 1 health
        },
        ICE_FREEZE: {
            slowdown: 0.5           //Slows down to 50% speed
        },
        POINTS_FREEZE: {
            freeze: true            //Freezes enemy score counters
        },
        COIN_SHOWER: {
            percentage: 0.25        //25% of current score
        },
        PIERCING_BULLETS: {
            pierce: true            //Bullets pass through enemies
        },
        INVINCIBILITY: {
            immune: true            //Complete immunity to damage
        },
        SPEED_TAMER: {
            reduction: 0.1          //Reduces by 10% per stack (normal balance)
        },
        KNIFE: {
            killPercentage: 0.5     //Kills 50% of enemies on screen
        }
    },

    //Rarity system and drop chances
    RARITY: {
        //Drop chances by rarity (standard settings)
        CHANCES: {
            COMMON: 50,      //50%
            RARE: 35,        //35%
            EPIC: 12,        //12%
            LEGENDARY: 3     //3%
        },

        //Boost distribution by rarity (standard balancing)
        //Halloween Event: SCREAM and KNIFE are added dynamically for Halloween theme
        DISTRIBUTION: {
            COMMON: ['RAPID_FIRE', 'ICE_FREEZE', 'HEALTH_BOOST', 'POINTS_FREEZE'],
            RARE: ['SHIELD_BARRIER', 'AUTO_TARGET', 'INVINCIBILITY', 'MULTI_SHOT', 'SCORE_MULTIPLIER', 'RICOCHET'],
            EPIC: ['WAVE_BLAST', 'COIN_SHOWER', 'GRAVITY_WELL', 'PIERCING_BULLETS'],
            LEGENDARY: ['RANDOM_CHAOS', 'SPEED_TAMER']
        },

        //Halloween boosts (added only for Halloween theme)
        //Each boost repeated 8 times for 20% probability (50% COMMON × 8/20 = 20%)
        HALLOWEEN_BOOSTS: ['SCREAM', 'SCREAM', 'SCREAM', 'SCREAM', 'SCREAM', 'SCREAM', 'SCREAM', 'SCREAM', 'KNIFE', 'KNIFE', 'KNIFE', 'KNIFE', 'KNIFE', 'KNIFE', 'KNIFE', 'KNIFE'],

        //Colors by rarity
        COLORS: {
            COMMON: '#ffffff',      //White
            RARE: '#00ddff',        //Light blue
            EPIC: '#9f00ff',        //Purple
            LEGENDARY: '#ffd700'    //Gold
        }
    },

    //Spawn mechanics
    SPAWN: {
        DROP_CHANCE: 0.07,       //7% drop chance
        FALL_SPEED: 2.1,         //Fall speed (increased by 40%: 1.5 * 1.4 = 2.1)
        LIFETIME: 10000,         //10 seconds lifetime on screen
        SIZE: 60,                //Boost size in pixels
        GLOW_RADIUS: 0           //Glow radius (disabled)
    },

    //Visual effects
    VISUAL: {
        RAPID_FIRE: { color: '#ffff00', glow: true },      //Yellow with glow
        SHIELD_BARRIER: { color: '#0088ff', glow: true },  //Blue with glow
        SCORE_MULTIPLIER: { color: '#ffd700', glow: true }, //Gold with glow
        POINTS_FREEZE: { color: '#88ddff', particles: true }, //Light blue with particles
        MULTI_SHOT: { color: '#ff4444', trail: true },     //Red with trail
        HEALTH_BOOST: { color: '#0088ff', heal: true },    //Blue with heal
        PIERCING_BULLETS: { color: '#ffffff', energy: true }, //White with energy
        INVINCIBILITY: { color: '#rainbow', sparkle: true }, //Rainbow with sparkles
        GRAVITY_WELL: { color: '#330066', distort: true }, //Dark with distortion
        RICOCHET: { color: '#00ff44', shield: true },  //Green with shield
        RANDOM_CHAOS: { color: '#multicolor', random: true }, //Multicolor
        ICE_FREEZE: { color: '#aaeeff', frost: true },     //Ice with frost
        AUTO_TARGET: { color: '#ff0000', crosshair: true }, //Red with crosshair
        COIN_SHOWER: { color: '#ffd700', coins: true },    //Gold with coins
        WAVE_BLAST: { color: '#0088ff', wave: true },      //Blue with wave
        SPEED_TAMER: { color: '#8844aa', snail: true },    //Purple with snail
        SCREAM: { color: '#ff0000', scream: true },        //Red (Easter Egg)
        KNIFE: { color: '#8b0000', ghost: true }           //Dark red with ghost
    },

    //Sound effects
    SOUNDS: {
        DROP: 'boost_drop.wav',
        PICKUP: 'boost_pickup.wav',
        ACTIVATE: 'boost_activate.wav',
        EXPIRE: 'boost_expire.wav'
    },

    //Text and icons
    INFO: {
        RAPID_FIRE: { icon: '', name: 'Rapid Fire' },
        SHIELD_BARRIER: { icon: '', name: 'Shield Barrier' },
        SCORE_MULTIPLIER: { icon: '', name: 'Score Multiplier' },
        POINTS_FREEZE: { icon: '⏰', name: 'Points Freeze' },
        MULTI_SHOT: { icon: '', name: 'Multi-Shot' },
        HEALTH_BOOST: { icon: '', name: 'Health Boost' },
        PIERCING_BULLETS: { icon: '', name: 'Piercing Bullets' },
        INVINCIBILITY: { icon: '', name: 'Invincibility' },
        GRAVITY_WELL: { icon: '', name: 'Gravity Well' },
        RICOCHET: { icon: '', name: 'Ricochet' },
        RANDOM_CHAOS: { icon: '', name: 'Random Chaos' },
        ICE_FREEZE: { icon: '', name: 'Ice Freeze' },
        AUTO_TARGET: { icon: '', name: 'Auto-Target' },
        COIN_SHOWER: { icon: '', name: 'Coin Shower' },
        WAVE_BLAST: { icon: '', name: 'Wave Blast' },
        SPEED_TAMER: { icon: '', name: 'Speed Tamer' },
        SCREAM: { icon: '', name: 'Scream' },
        KNIFE: { icon: '', name: 'Ghost Knife' }
    }
};

//Export constants
window.BOOST_CONSTANTS = BOOST_CONSTANTS;
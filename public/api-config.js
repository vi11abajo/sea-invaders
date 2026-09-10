//API Configuration
//Backend server connection settings

const API_CONFIG = {
    //Backend URL (automatically determined by environment)
    BASE_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : window.location.origin, //Use current origin (works for dev and prod)

    //Socket.IO URL (for real-time tournaments)
    SOCKET_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : window.location.origin,

    //Endpoints
    ENDPOINTS: {
        //Auth
        AUTH_DISCORD: '/api/auth/discord',
        AUTH_ME: '/api/auth/me',
        AUTH_LOGOUT: '/api/auth/logout',

        //Scores
        SESSION_START: '/api/scores/session/start',
        SESSION_HEARTBEAT: '/api/scores/session/heartbeat',
        SCORE_SUBMIT: '/api/scores/submit',
        MY_SCORES: '/api/scores/my-scores',

        //Leaderboard
        LEADERBOARD_MAIN: '/api/leaderboard/main',
        LEADERBOARD_TOURNAMENT: '/api/leaderboard/tournament',
        LEADERBOARD_TOP_PLAYERS: '/api/leaderboard/top-players',
        MY_RANK: '/api/leaderboard/my-rank',

        //Tournaments
        TOURNAMENTS_LIST: '/api/tournaments',
        TOURNAMENT_DETAILS: '/api/tournaments',
        TOURNAMENT_CURRENT: '/api/tournaments/active/current',
    },

    //settings
    SETTINGS: {
        //Heartbeat frequency (ms) - optimized for 200+ players
        HEARTBEAT_INTERVAL: 30000, //30 seconds (was 10)

        //Leaderboard refresh frequency (ms)
        LEADERBOARD_REFRESH: 60000, //60 seconds (was 30)

        //Request timeout (ms) - reduced from 10000ms to 2000ms
        REQUEST_TIMEOUT: 2000, //2 seconds
    }
};

//Export configuration
window.API_CONFIG = API_CONFIG;

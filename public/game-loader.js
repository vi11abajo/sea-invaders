// GAME LOADER - Sequential script loading
// This ensures dependencies load in correct order

console.log('🎮 [GameLoader] Starting sequential script loading...');

// Helper function to load script sequentially
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      console.log(`✅ [GameLoader] Loaded: ${src}`);
      resolve();
    };
    script.onerror = () => {
      console.error(`❌ [GameLoader] Failed to load: ${src}`);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });
}

// Load scripts in sequence
async function loadGameScripts() {
  try {
    // Core dependencies - API config and Auth FIRST (order is critical!)
    await loadScript('/api-config.js');      // 1. Config first
    await loadScript('/api-client.js');      // 2. API client (uses API_CONFIG)
    await loadScript('/auth-manager.js');    // 3. Auth manager (uses apiClient)
    await loadScript('/preload-manager.js');
    await loadScript('/sound-manager.js');
    await loadScript('/performance-optimizer.js');
    await loadScript('/performance-monitor.js');
    await loadScript('/game-session-manager.js');

    // Boss system (order matters!)
    await loadScript('/boss-system/boss-system.js');
    await loadScript('/boss-system/boss-abilities.js');
    await loadScript('/boss-system/boss-attacks.js');
    await loadScript('/boss-system/boss-renderer.js');

    // Boost system
    await loadScript('/boosts/boost-constants.js');
    await loadScript('/boosts/boost-effects.js');
    await loadScript('/boosts/boost-integration.js');
    await loadScript('/boosts/boost-system.js');
    await loadScript('/boosts/boost-manager.js');

    console.log('✅ [GameLoader] All game scripts loaded successfully!');
    window.gameScriptsLoaded = true;

    // Emit an event to notify React components
    window.dispatchEvent(new CustomEvent('gameScriptsLoaded'));
  } catch (error) {
    console.error('❌ [GameLoader] Failed to load game scripts:', error);
    window.gameScriptsLoaded = false;
  }
}

// Start loading
loadGameScripts();

// CRITICAL: Load environment variables FIRST before any other imports (see migrations/run.js).
import '../loadEnv.js';

import { runWeekly } from '../services/weekly.js';

async function main() {
  try {
    const result = await runWeekly({ now: Math.floor(Date.now() / 1000) });
    console.log('Weekly crank finished:', result);
    process.exit(0);
  } catch (error) {
    console.error('Weekly crank failed:', error);
    process.exit(1);
  }
}

main();

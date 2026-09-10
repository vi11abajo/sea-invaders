// Load environment variables BEFORE any other imports
// This file must be imported first in app.js
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory (one level up from src/)
dotenv.config({ path: join(__dirname, '../.env') });

console.log('🔧 Environment variables loaded from .env');

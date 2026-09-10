import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

const isTournamentBuild = process.env.BUILD_TARGET === 'tournament';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: isTournamentBuild
        ? 'tournament/tournament-lobby.html'
        : 'index.html',
    },
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    open: true,
    host: '0.0.0.0',
    allowedHosts: [
      'localhost',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok-free.app'
    ]
  }
});

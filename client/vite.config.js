import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5843,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3843',
        ws: true,
      },
    },
  },
});

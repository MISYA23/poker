import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5843,
    proxy: {
      '/socket.io': {
        target: `http://localhost:${process.env.SERVER_PORT || 3843}`,
        ws: true,
      },
      '/auth': {
        target: `http://localhost:${process.env.SERVER_PORT || 3843}`,
      },
      '/api': {
        target: `http://localhost:${process.env.SERVER_PORT || 3843}`,
      },
    },
  },
});

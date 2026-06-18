import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Alvo do backend e porta do dev server configuráveis por env, para conviver com
// outros serviços rodando localmente (ex.: portas 3000/5173 já ocupadas).
const apiTarget = process.env.ELO_API_TARGET ?? 'http://localhost:3000';
const port = Number(process.env.ELO_TUTOR_PORT ?? 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    proxy: {
      '/v1': { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
});

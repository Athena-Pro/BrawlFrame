import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isCI = !!process.env.GITHUB_ACTIONS;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')?.[1] ?? '';
  return {
    // 👇 important for GitHub Pages
    base: isCI && repo ? `/${repo}/` : '/',
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') }
    }
  };
});

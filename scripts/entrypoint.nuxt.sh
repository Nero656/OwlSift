#!/bin/sh
set -e
cd /app

# ─── 1. package.json ────────────────────────────────────────────
if [ ! -f "package.json" ]; then
  echo "→ Создаём package.json..."
  cat > package.json <<'JSON'
{
  "name": "vue3app",
  "private": true,
  "version": "1.0.0",
  "main": "dist/main.js",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "electron:dev": "npm run build:electron && electron dist/main.js --no-sandbox",
    "electron:build": "electron-builder"
  },
  "devDependencies": {
    "@formkit/auto-animate": "^0.10.0",
    "@nuxt/ui": "^3.0.0",
    "@nuxtjs/color-mode": "^3.5.0",
    "@tailwindcss/vite": "^4.0.0",
    "electron": "^38.8.6",
    "electron-builder": "^26.0.0",
    "nuxt": "^4.5.2",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vue-tsc": "^2.0.0"
  }
}
JSON
fi

# ─── 2. nuxt.config.ts ──────────────────────────────────────────
if [ ! -f "nuxt.config.ts" ]; then
  cat > nuxt.config.ts <<'TS'
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  typescript: { strict: true, typeCheck: false },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/color-mode',
    '@formkit/auto-animate',
  ],
  css: ['~/assets/css/main.css'],
})
TS
fi

# ─── 3. tsconfig.json (для Nuxt) ────────────────────────────────
if [ ! -f "tsconfig.json" ]; then
  echo '{ "extends": "./.nuxt/tsconfig.json" }' > tsconfig.json
fi

# ─── 4. tsconfig.electron.json ──────────────────────────────────
if [ ! -f "tsconfig.electron.json" ]; then
  cat > tsconfig.electron.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
JSON
fi

# ─── 5. CSS ─────────────────────────────────────────────────────
mkdir -p app/assets/css
if [ ! -f "app/assets/css/main.css" ]; then
  cat > app/assets/css/main.css <<'CSS'
@import "tailwindcss";
@import "@nuxt/ui";
CSS
fi

# ─── 6. app/ + pages/ ───────────────────────────────────────────
mkdir -p app/pages

if [ ! -f "app/app.vue" ]; then
  cat > app/app.vue <<'VUE'
<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
VUE
fi

if [ ! -f "app/pages/index.vue" ]; then
  cat > app/pages/index.vue <<'VUE'
<template>
  <div style="padding:2rem;font-family:system-ui">
    <h1>AI Client</h1>
    <NuxtLink to="/settings">Настройки</NuxtLink>
  </div>
</template>
VUE
fi

if [ ! -f "app/pages/settings.vue" ]; then
  cat > app/pages/settings.vue <<'VUE'
<template>
  <div style="padding:2rem;font-family:system-ui">
    <h1>Настройки</h1>
    <NuxtLink to="/">← Назад</NuxtLink>
  </div>
</template>
VUE
fi

# ─── 7. Установка зависимостей ──────────────────────────────────
if [ ! -x "node_modules/.bin/nuxt" ]; then
  echo "→ Устанавливаем зависимости..."
  npm install
fi

exec npm run dev -- --host 0.0.0.0
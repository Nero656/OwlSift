#!/bin/sh
set -e
cd /app

# Ждём, пока nuxt-контейнер создаст package.json
echo "→ Ждём package.json от nuxt..."
T=0
until [ -f "package.json" ]; do
  T=$((T+1)); [ $T -gt 60 ] && echo "✗ package.json не появился" && exit 1
  sleep 2
done

# Ставим зависимости, если их нет
if [ ! -x "node_modules/.bin/electron" ]; then
  echo "→ Устанавливаем зависимости Electron (может занять пару минут)..."
  npm install
fi

echo "→ Ожидаем Nuxt..."
T=0
until node -e "require('http').get('http://nuxt:3000',r=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; do
  T=$((T+1)); [ $T -gt 60 ] && echo "✗ Nuxt не поднялся" && exit 1
  sleep 2
done

echo "→ Всё готово, запускаем Electron..."
exec npm run electron:dev
#exec dbus-launch --exit-with-session npm run electron:dev
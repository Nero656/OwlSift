export default defineNuxtConfig({
  ssr: false,
  app: {
    head: {
      title: 'OwlSift',
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '1024x1024', href: '/icon.png' },
        { rel: 'apple-touch-icon', href: '/icon.png' },
      ],
    },
  },
  devtools: { enabled: true },
  typescript: { strict: true, typeCheck: false },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/color-mode',
    '@formkit/auto-animate',
  ],
  css: ['~/assets/css/main.css'],
})

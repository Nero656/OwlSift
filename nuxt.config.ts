export default defineNuxtConfig({
  ssr: false,
  app: { head: { title: 'OwlSift' } },
  devtools: { enabled: true },
  typescript: { strict: true, typeCheck: false },
  modules: [
    '@nuxt/ui',
    '@nuxtjs/color-mode',
    '@formkit/auto-animate',
  ],
  css: ['~/assets/css/main.css'],
})

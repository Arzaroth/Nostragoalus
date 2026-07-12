import ToastService from 'primevue/toastservice'

// The PrimeVue Nuxt module auto-imports components/directives but does not
// install services, so useToast() has no provider. Register ToastService here
// (universal: useToast runs in setup during SSR too).
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(ToastService)
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            // Jede Anfrage, die mit '/swr-proxy' beginnt...
            '/swr-proxy': {
                target: 'https://hooks.swr.de', // ...geht an den SWR Server
                changeOrigin: true, // ...und wir schwindeln dem SWR Server vor, wir wären berechtigt
                rewrite: (path) => path.replace(/^\/swr-proxy/, '') // ...und wir entfernen das '/swr-proxy' aus dem Pfad
            }
        }
    }
})
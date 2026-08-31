import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve('src'),
        '@main': resolve('src/main'),
        '@lib': resolve('src/lib')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@': resolve('src'),
        '@preload': resolve('src/preload'),
        '@lib': resolve('src/lib')
      }
    }
  },
  renderer: {
    build: {
      assetsInlineLimit: (filePath: string) =>
        /\.(?:woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src'),
        '@components': resolve('src/renderer/src/components'),
        '@assets': resolve('src/renderer/src/assets'),
        '@lib': resolve('src/lib'),
        '@pages': resolve('src/renderer/src/pages'),
        '@types': resolve('src/renderer/src/types'),
        '@codemirror/state': resolve('./node_modules/@codemirror/state/dist/index.cjs'),
        '@codemirror/view': resolve('./node_modules/@codemirror/view/dist/index.cjs'),
        '@codemirror/language': resolve('./node_modules/@codemirror/language/dist/index.cjs')
      }
    },
    plugins: [react()]
  }
})

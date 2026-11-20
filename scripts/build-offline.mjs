import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { build } from 'vite'

const bundle = await build({
  configFile: false,
  build: {
    write: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    rolldownOptions: {
      input: 'src/main.ts',
      output: { format: 'iife', name: 'Speller', codeSplitting: false },
    },
  },
})

const outputs = bundle.output
const script = outputs.find(item => item.type === 'chunk' && item.isEntry)
const style = outputs.find(item => item.type === 'asset' && item.fileName.endsWith('.css'))
if (!script || !style || outputs.length !== 2) throw new Error('Expected one script and one stylesheet for offline play')

const template = await readFile('index.html', 'utf8')
const entry = '<script type="module" src="/src/main.ts"></script>'
if (!template.includes(entry)) throw new Error('Game entry not found in index.html')
const html = template.replace('</head>', () => `<style>${style.source}</style>\n</head>`)
  .replace(entry, () => `<script>${script.code.replace(/<\/script/gi, '<\\/script')}</script>`)
await mkdir('offline', { recursive: true })
await writeFile('offline/Speller.html', html)
console.log('Offline game: offline/Speller.html')

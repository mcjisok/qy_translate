import { createApp } from 'vue'
import app from './components/app.vue'
import {setUI} from '@/components/ElementUIImport';

console.log("content js in......")

function joinContent() {
  const id = 'phraseJoinewrskdfdswerhnyikyofd'
  const div = document.createElement('div')
  div.id = id
  document.body?.appendChild(div)

  const theApp = createApp(app)
  setUI(theApp)
  theApp.mount('#' + id)
}

joinContent()

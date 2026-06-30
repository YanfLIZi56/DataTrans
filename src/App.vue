<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDataStore } from '@/stores/dataStore'
import InputPanel from '@/components/InputPanel.vue'
import FieldTree from '@/components/FieldTree.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ModalPopup from '@/components/ModalPopup.vue'

const store = useDataStore()
const showModal = ref(false)
const modalContent = ref('')
const isDark = ref(false)

onMounted(() => {
  const hasHistory = store.loadHistory()
  if (!hasHistory) {
    store.loadSampleData()
  } else {
    store.parseInput()
  }
  const savedDark = localStorage.getItem('datatrans_dark')
  if (savedDark === 'true') {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
})

function toggleDark() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('datatrans_dark', String(isDark.value))
}

function generateAndShowOutput() {
  store.performConversion()
  modalContent.value = store.outputText
  showModal.value = true
}

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    store.parseInput()
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    e.preventDefault()
    generateAndShowOutput()
  }
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('reset-zoom'))
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-screen w-screen flex flex-col overflow-hidden apple-notes-bg">
    <!-- Header -->
    <header
      class="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white/90 backdrop-blur-lg border-b border-amber-200/50 z-40 shadow-sm">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-amber-400/30">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h1 class="text-base font-bold text-amber-800 tracking-tight">DataTrans</h1>
          <p class="text-[10px] text-amber-600 uppercase tracking-wider">Data Format Converter</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <button @click="toggleDark"
          class="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors text-amber-700"
          :title="isDark ? '切换到亮色模式' : '切换到暗色模式'">
          <svg v-if="isDark" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>
        <div class="flex items-center gap-2">
          <label class="text-xs font-medium text-amber-700">Target Format</label>
          <select v-model="store.outputFormat" @change="store.performConversion()"
            class="text-xs border-2 border-amber-300 rounded-lg px-3 py-1.5 bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all">
            <option value="JSON">JSON</option>
            <option value="YAML">YAML</option>
            <option value="SQL (建表)">SQL (建表)</option>
            <option value="SQL (新增)">SQL (新增)</option>
            <option value="SQL (查询)">SQL (查询)</option>
            <option value="SQL (更新)">SQL (更新)</option>
            <option value="Java POJO">Java POJO</option>
            <option value="Python Dataclass">Python Dataclass</option>
            <option value="Go Struct">Go Struct</option>
            <option value="TypeScript Interface">TypeScript Interface</option>
            <option value="TOML">TOML</option>
            <option value="ES Mapping">ES Mapping</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs font-medium text-amber-700">Root Class Name</label>
          <input v-model="store.rootClassName" type="text"
            class="w-24 text-xs border-2 border-amber-300 rounded-lg px-3 py-1.5 bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
            placeholder="RootClass" />
        </div>
        <div class="flex items-center gap-2">
          <label class="text-xs font-medium text-amber-700">SQL Dialect</label>
          <select v-model="store.sqlDialect"
            class="text-xs border-2 border-amber-300 rounded-lg px-3 py-1.5 bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all">
            <option value="MySQL">MySQL</option>
            <option value="PostgreSQL">PostgreSQL</option>
            <option value="SQL Server">SQL Server</option>
          </select>
        </div>
        <div class="flex items-center gap-1">
          <label class="text-xs font-medium text-amber-700">Field Case</label>
          <select v-model="store.caseStyle" @change="store.performConversion()"
            class="text-xs border-2 border-amber-300 rounded-lg px-2 py-1.5 bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all">
            <option value="none">保持原样</option>
            <option value="snake">Aa → a_a</option>
            <option value="camel">a_a → Aa</option>
          </select>
        </div>
        <button @click="generateAndShowOutput"
          class="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl flex items-center gap-2 border-2 border-amber-600/30">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          转换
        </button>
      </div>
    </header>

    <!-- Main area: visualization + floating input -->
    <div class="flex-1 relative overflow-hidden">
      <FieldTree />
      <InputPanel />
    </div>

    <!-- Toast notifications -->
    <ToastNotification />

    <!-- Modal popup -->
    <ModalPopup :visible="showModal" :title="store.outputFormat + ' Output'" :content="modalContent"
      @close="showModal = false" />
  </div>
</template>
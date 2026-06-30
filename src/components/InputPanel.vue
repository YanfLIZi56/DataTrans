<script setup lang="ts">
import { ref } from "vue"
import { useDataStore } from "@/stores/dataStore"
import type { InputFormat } from "@/types"

const store = useDataStore()

const inputFormats: InputFormat[] = ["JSON", "YAML", "CSV", "SQL(DDL)", "ES Mapping", "TOML"]

const apiUrl = ref("")
const isFetching = ref(false)

const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const panelX = ref(500)
const panelY = ref(200)
const autoParse = ref(true)

function onMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest("button, input, select, textarea")) return
  isDragging.value = true
  dragStartX.value = e.clientX - panelX.value
  dragStartY.value = e.clientY - panelY.value
  document.addEventListener("mousemove", onMouseMove)
  document.addEventListener("mouseup", onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return
  panelX.value = Math.max(0, e.clientX - dragStartX.value)
  panelY.value = Math.max(0, e.clientY - dragStartY.value)
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener("mousemove", onMouseMove)
  document.removeEventListener("mouseup", onMouseUp)
}

function onPaste(e: ClipboardEvent) {
  if (!autoParse.value) return
  const pasted = e.clipboardData?.getData('text')
  if (!pasted) return
  setTimeout(() => {
    if (store.inputText.trim() === pasted.trim()) {
      store.inputText = pasted
      store.parseInput()
    }
  }, 50)
}

async function fetchFromUrl() {
  const url = apiUrl.value.trim()
  if (!url) {
    store.addToast("请输入 API 地址", "warning")
    return
  }
  isFetching.value = true
  try {
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
    }
    const text = await resp.text()
    // 尝试格式化 JSON
    try {
      const obj = JSON.parse(text)
      store.inputText = JSON.stringify(obj, null, 2)
      store.inputFormat = "JSON"
    } catch {
      store.inputText = text
    }
    store.parseInput()
  } catch (e) {
    const msg = (e as Error).message || String(e)
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      store.addToast("请求失败，可能是跨域(CORS)限制，请尝试用浏览器直接访问该地址后复制 JSON 进来", "error")
    } else {
      store.addToast("获取失败：" + msg, "error")
    }
  } finally {
    isFetching.value = false
  }
}
</script>

<template>
  <div
    class="fixed z-50 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border-2 border-amber-200/50 w-80 overflow-hidden"
    :style="{ left: panelX + 'px', top: panelY + 'px', cursor: isDragging ? 'grabbing' : 'grab' }"
    @mousedown="onMouseDown">
    <div
      class="px-4 py-3 bg-gradient-to-r from-amber-400 to-amber-500 text-white flex items-center justify-between select-none">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
        <span class="text-xs font-semibold">Input Data Source</span>
      </div>
      <span class="text-[10px] text-white/70">Drag to move</span>
    </div>

    <div class="p-4 space-y-3">
      <div>
        <label class="block text-xs font-semibold text-amber-800 mb-1.5">Input Format</label>
        <select v-model="store.inputFormat"
          class="w-full text-xs rounded-lg border-2 border-amber-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all">
          <option v-for="fmt in inputFormats" :key="fmt" :value="fmt">{{ fmt }}</option>
        </select>
        <label class="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none">
          <input type="checkbox" v-model="autoParse" class="w-3 h-3 accent-amber-500" />
          <span class="text-[10px] text-amber-600">粘贴后自动解析</span>
        </label>
      </div>

      <div>
        <label class="block text-xs font-semibold text-amber-800 mb-1.5">API URL (Fetch JSON)</label>
        <div class="flex gap-1.5">
          <input v-model="apiUrl" type="text"
            class="flex-1 text-xs border-2 border-amber-300 rounded-lg px-3 py-1.5 bg-white/80 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all"
            placeholder="https://api.example.com/data" />
          <button @click="fetchFromUrl" :disabled="isFetching"
            class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 text-white hover:from-amber-500 hover:to-amber-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
            {{ isFetching ? 'Fetching...' : 'Fetch' }}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-amber-800 mb-1.5">Input Data</label>
        <textarea v-model="store.inputText" @paste="onPaste"
          class="w-full h-40 text-xs font-mono rounded-lg border-2 border-amber-300 bg-amber-50/50 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none transition-all"
          placeholder="Paste raw data here..."></textarea>
      </div>

      <button
        class="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl flex items-center justify-center gap-2 border-2 border-amber-600/30"
        @click="store.parseInput()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <span>Parse &amp; Visualize</span>
      </button>
    </div>
  </div>
</template>
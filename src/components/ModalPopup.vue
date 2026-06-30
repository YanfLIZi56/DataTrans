<script setup lang="ts">
interface Props {
    visible: boolean
    title: string
    content: string
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
}>()

function copyContent(content: string) {
    if (!content) return
    navigator.clipboard.writeText(content).then(() => {
        // Copy success
    }).catch(() => {
        // Copy failed
    })
}

function downloadContent(content: string, title: string) {
    if (!content) return
    const extensionMap: Record<string, string> = {
        'JSON': '.json',
        'YAML': '.yaml',
        'SQL (建表)': '.sql',
        'SQL (新增)': '.sql',
        'SQL (查询)': '.sql',
        'SQL (更新)': '.sql',
        'Java POJO': '.java',
        'Python Dataclass': '.py',
        'Go Struct': '.go',
        'ES Mapping': '.json'
    }
    const ext = extensionMap[title] || '.txt'
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `output${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="emit('close')"></div>

                <!-- Modal content -->
                <div
                    class="relative bg-gradient-to-br from-amber-50 to-amber-100 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-300">
                    <!-- Header -->
                    <div class="flex items-center justify-between px-6 py-4 border-b border-amber-200/50 bg-white/50">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg flex items-center justify-center">
                                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h2 class="text-base font-bold text-amber-800">{{ title }}</h2>
                        </div>
                        <button @click="emit('close')"
                            class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-amber-200/50 transition-colors">
                            <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <!-- Content -->
                    <div class="p-6 overflow-auto max-h-[60vh]">
                        <pre
                            class="text-sm font-mono text-amber-900/90 bg-white/60 rounded-xl p-4 whitespace-pre-wrap break-all"><code>{{ content }}</code></pre>
                    </div>

                    <!-- Footer -->
                    <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-amber-200/50 bg-white/30">
                        <button @click="downloadContent(content, title)"
                            class="px-4 py-2 bg-amber-50 text-amber-700 font-medium rounded-lg hover:bg-amber-100 transition-colors flex items-center gap-2 border border-amber-200">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            下载文件
                        </button>
                        <button @click="copyContent(content)"
                            class="px-4 py-2 bg-amber-100 text-amber-700 font-medium rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            复制到剪贴板
                        </button>
                        <button @click="emit('close')"
                            class="px-6 py-2 bg-gradient-to-r from-amber-400 to-amber-500 text-white font-semibold rounded-lg hover:from-amber-500 hover:to-amber-600 transition-all shadow-md hover:shadow-lg">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
    transition: transform 0.3s ease;
}

.modal-enter-from .relative {
    transform: scale(0.95);
}

.modal-leave-to .relative {
    transform: scale(0.95);
}
</style>
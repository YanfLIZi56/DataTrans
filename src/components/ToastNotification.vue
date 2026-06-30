<script setup lang="ts">
import { useDataStore } from '@/stores/dataStore'

const store = useDataStore()
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none">
    <div
      v-for="toast in store.toasts"
      :key="toast.id"
      class="pointer-events-auto px-4 py-2 rounded-lg shadow-lg text-xs font-medium animate-slide-up"
      :class="{
        'bg-amber-50 text-amber-800 border border-amber-200': toast.type === 'warning',
        'bg-emerald-50 text-emerald-800 border border-emerald-200': toast.type === 'success',
        'bg-red-50 text-red-800 border border-red-200': toast.type === 'error',
      }"
    >{{ toast.message }}</div>
  </div>
</template>

<style scoped>
@keyframes slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.2s ease-out;
}
</style>

<script setup lang="ts">
import { ref, computed } from "vue"
import type { FieldNode, FieldType } from "@/types"
import { useDataStore } from "@/stores/dataStore"

const expandedArrays = ref<Set<string>>(new Set())

function toggleArrayDropdown(nodeId: string) {
  if (expandedArrays.value.has(nodeId)) {
    expandedArrays.value.delete(nodeId)
  } else {
    expandedArrays.value.add(nodeId)
  }
}

function getObjectPreview(objNode: FieldNode): string {
  if (!objNode.children || objNode.children.length === 0) return "{}"
  const previewProps = objNode.children.slice(0, 3).map(child => {
    const valueStr = child.value !== undefined && child.value !== null ? String(child.value).slice(0, 15) : ""
    return `${child.name}: ${valueStr || '...'}`
  }).join(", ")
  return `{ ${previewProps}${objNode.children.length > 3 ? ", ..." : ""} }`
}

const props = defineProps<{
  blockId: string
  blockTitle: string
  fields: FieldNode[]
  depth: number
  connectorFieldIds: Set<string>
  collapsedBlocks: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggleCollapse', blockId: string): void
}>()

const store = useDataStore()
const fieldTypes: FieldType[] = ["string", "integer", "float", "boolean", "object", "array", "null"]

function typeIcon(t: FieldType): string {
  switch (t) {
    case "object": return "{ }"
    case "array": return "[ ]"
    case "integer": case "float": return "123"
    case "boolean": return "T/F"
    case "null": return "\u2205"
    default: return "abc"
  }
}

function typeLabel(t: FieldType): string {
  switch (t) {
    case "string": return "str"
    case "integer": return "int"
    case "float": return "flt"
    case "boolean": return "bool"
    case "object": return "obj"
    case "array": return "arr"
    case "null": return "nul"
  }
}

function isObjectArray(n: FieldNode): boolean {
  return n.type === "array" && n.arrayItemType === "object"
}

function hasSubBlock(n: FieldNode): boolean {
  return props.connectorFieldIds.has(n.id)
}

function subBlockId(n: FieldNode): string {
  return 'b-' + n.id
}

function isCollapsed(n: FieldNode): boolean {
  return props.collapsedBlocks.has(subBlockId(n))
}

function onToggleCollapse(n: FieldNode) {
  emit('toggleCollapse', subBlockId(n))
}

function fieldInvalid(n: FieldNode): boolean {
  const t = n.type; const v = n.value
  if (v === undefined || v === null || v === "") return false
  if (t === "integer") { const num = Number(v); return isNaN(num) || !Number.isInteger(num) }
  if (t === "float") return isNaN(Number(v))
  if (t === "boolean") return v !== true && v !== false && v !== "true" && v !== "false"
  return false
}

function onName(node: FieldNode, e: Event) {
  store.updateNode(node.id, { name: (e.target as HTMLInputElement).value })
}
function onType(node: FieldNode, e: Event) {
  store.updateNode(node.id, { type: (e.target as HTMLSelectElement).value as FieldType })
}
function onValue(node: FieldNode, e: Event) {
  store.updateNode(node.id, { value: (e.target as HTMLInputElement).value })
}
function onColor(node: FieldNode, e: Event) {
  store.updateNode(node.id, { value: (e.target as HTMLInputElement).value })
}
function onDelete(node: FieldNode) {
  store.deleteNode(node.id)
}
</script>

<template>
  <div :data-block-id="blockId"
    class="er-block absolute bg-white rounded-lg shadow-md border border-slate-200 select-none"
    :style="{ minWidth: '260px', maxWidth: '400px' }">
    <!-- Block header -->
    <div class="flex items-center gap-1.5 px-3 py-2 cursor-move"
      :class="depth === 0 ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white' : 'bg-slate-700 text-slate-100'">
      <span class="text-[10px] font-mono opacity-70 flex-shrink-0">{{ depth === 0 ? '{ }' : typeIcon(fields[0]?.type ||
        'object') }}</span>
      <span class="flex-1 text-xs font-semibold truncate">{{ blockTitle }}</span>
      <button v-if="depth === 0" @click="store.addRootField()" title="Add field"
        class="w-5 h-5 flex items-center justify-center text-[10px] opacity-50 hover:opacity-100 hover:bg-white/10 rounded transition-colors flex-shrink-0">+</button>
    </div>

    <!-- Field rows -->
    <div class="p-1.5 space-y-0.5">
      <div v-for="field in fields" :key="field.id"
        class="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-slate-50 group">
        <!-- Type icon -->
        <span class="text-[9px] font-mono font-semibold flex-shrink-0 w-4 text-center" :class="{
          'text-blue-600': field.type === 'object',
          'text-amber-600': field.type === 'array',
          'text-emerald-600': field.type === 'integer' || field.type === 'float',
          'text-purple-600': field.type === 'boolean',
          'text-slate-400': field.type === 'null',
          'text-slate-600': field.type === 'string',
        }">{{ typeIcon(field.type) }}</span>

        <!-- Name -->
        <input type="text" :value="field.name" @input="onName(field, $event)"
          class="w-20 text-[10px] font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-700 flex-shrink-0" />

        <!-- Type select -->
        <select :value="field.type" @change="onType(field, $event)"
          class="text-[9px] bg-slate-100 border border-slate-200 rounded px-1 py-0 text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-400 flex-shrink-0">
          <option v-for="t in fieldTypes" :key="t" :value="t">{{ typeLabel(t) }}</option>
        </select>

        <!-- Array field display with dropdown -->
        <template v-if="field.type === 'array'">
          <div class="flex-1 relative">
            <!-- Array preview header -->
            <div
              class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1 cursor-pointer hover:bg-amber-100 transition-colors"
              @click="toggleArrayDropdown(field.id)">
              <div class="flex items-center gap-1">
                <span class="text-amber-600 text-[10px] font-mono">["</span>
                <span class="text-[10px] font-mono text-slate-600 truncate max-w-[120px]">
                  {{ field.children?.[0]?.value || field.children?.[0]?.id?.slice(0, 8) || '' }}
                </span>
                <span class="text-amber-600 text-[10px] font-mono">"</span>
                <span v-if="field.children && field.children.length > 1" class="text-slate-400 text-[10px]">
                  , ...({{ field.children.length }} items)
                </span>
                <span v-if="!field.children || field.children.length === 0" class="text-slate-400 text-[10px]">
                  empty
                </span>
              </div>
              <span class="text-slate-400 text-[10px] transition-transform"
                :class="{ 'rotate-180': expandedArrays.has(field.id) }">▼</span>
            </div>

            <!-- Dropdown panel -->
            <div v-if="expandedArrays.has(field.id)"
              class="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-hidden flex flex-col min-w-full">
              <!-- Array items list -->
              <div class="flex-1 overflow-y-auto">
                <div v-for="(item, idx) in field.children || []" :key="item.id"
                  class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                  <span class="text-[10px] text-slate-400 font-mono w-6 flex-shrink-0">[{{ idx }}]</span>
                  <input type="text" :value="item.value != null ? String(item.value) : ''"
                    @input="store.updateNode(item.id, { value: ($event.target as HTMLInputElement).value })"
                    class="flex-1 text-[10px] font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-600"
                    placeholder="value" />
                  <button @click.stop="store.deleteNode(item.id)"
                    class="w-5 h-5 flex items-center justify-center text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded border-2 border-red-200 hover:border-red-400 flex-shrink-0 transition-all">×</button>
                </div>
                <div v-if="!field.children || field.children.length === 0"
                  class="px-2 py-3 text-[10px] text-slate-400 text-center">
                  Empty array
                </div>
              </div>

              <!-- Action buttons at bottom -->
              <div
                class="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50/50 to-amber-100/50 border-t border-amber-200/50">
                <button @click.stop="store.addArrayItem(field.id)"
                  class="flex-1 bg-gradient-to-r from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md flex items-center justify-center gap-1 border-2 border-green-600/30">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
                <button v-if="field.children && field.children.length > 0" @click.stop="store.clearArray(field.id)"
                  class="flex-1 bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md flex items-center justify-center gap-1 border-2 border-red-600/30">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Regular value input -->
        <div v-else-if="field.type !== 'object' && !isObjectArray(field)"
          class="flex items-center gap-1 flex-1 min-w-0">
          <input type="text" :value="field.value != null ? String(field.value) : ''" @input="onValue(field, $event)"
            class="flex-1 text-[10px] font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-500 min-w-0" />
          <!-- Validation -->
          <span v-if="fieldInvalid(field)" class="text-red-500 font-bold text-[11px] cursor-help flex-shrink-0"
            title="字段类型不匹配">!</span>
          <!-- Color picker -->
          <div v-if="typeof field.value === 'string' && field.value.startsWith('#')" class="relative flex-shrink-0">
            <div class="w-4 h-4 rounded-full border border-slate-300 shadow-sm cursor-pointer"
              :style="{ backgroundColor: String(field.value) }"></div>
            <input type="color" :value="String(field.value)" @input="onColor(field, $event)"
              class="absolute inset-0 opacity-0 cursor-pointer w-4 h-4" />
          </div>
        </div>

        <!-- Collapse/expand button for fields that have sub-blocks -->
        <button v-if="hasSubBlock(field)" @click.stop="onToggleCollapse(field)"
          class="w-6 h-6 flex items-center justify-center text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md border-2 border-indigo-300 hover:border-indigo-500 transition-all flex-shrink-0 shadow-sm"
          :title="isCollapsed(field) ? 'Expand nested block' : 'Collapse nested block'">
          {{ isCollapsed(field) ? '▶' : '▼' }}
        </button>

        <!-- Add child button for expandable fields -->
        <button v-if="field.type === 'object' || isObjectArray(field)" @click="store.addChildField(field.id)"
          title="Add child field"
          class="w-6 h-6 flex items-center justify-center text-xs font-bold text-green-600 hover:text-green-700 hover:bg-green-50 rounded-md border-2 border-green-300 hover:border-green-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 shadow-sm">+</button>

        <!-- Delete button -->
        <button @click="onDelete(field)"
          class="w-6 h-6 flex items-center justify-center text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md border-2 border-red-300 hover:border-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 shadow-sm">&times;</button>
      </div>

      <!-- Empty state -->
      <div v-if="fields.length === 0" class="text-[10px] text-slate-400 px-2 py-3 text-center">
        No fields
      </div>
    </div>
  </div>
</template>
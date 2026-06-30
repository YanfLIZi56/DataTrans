<script setup lang="ts">
import { ref, computed } from "vue"
import type { FieldNode, FieldType } from "@/types"
import { useDataStore } from "@/stores/dataStore"

const props = defineProps<{
  node: FieldNode
  depth: number
  position?: { x: number; y: number }
}>()

const store = useDataStore()
const fieldTypes: FieldType[] = ["string", "integer", "float", "boolean", "object", "array", "null"]

const isRoot = computed(() => props.depth === 0)
const isExpandable = computed(() => props.node.type === "object" || props.node.type === "array")
const hasChildren = computed(() => !!(props.node.children && props.node.children.length > 0))
const isColorValue = computed(() => typeof props.node.value === "string" && String(props.node.value).startsWith("#"))

const arrayPreview = computed(() => {
  if (props.node.type !== "array" || !props.node.children || props.node.children.length === 0) return ""
  const values = props.node.children.map(c => {
    if (c.type === "string") return `"${String(c.value)}"`
    return String(c.value)
  })
  return "[" + values.join(", ") + "]"
})

const arrayItemsPreview = computed(() => {
  if (props.node.type !== "array" || !props.node.children || props.node.children.length === 0) return []
  return props.node.children.slice(0, 5)
})

const hasMoreItems = computed(() => {
  return props.node.type === "array" && props.node.children && props.node.children.length > 5
})

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

const isValueInvalid = computed(() => {
  const t = props.node.type
  const v = props.node.value
  if (v === undefined || v === null || v === "") return false
  if (t === "integer") { const n = Number(v); return isNaN(n) || !Number.isInteger(n) }
  if (t === "float") return isNaN(Number(v))
  if (t === "boolean") return v !== true && v !== false && v !== "true" && v !== "false"
  return false
})

function childValueInvalid(child: FieldNode): boolean {
  const t = child.type
  const v = child.value
  if (v === undefined || v === null || v === "") return false
  if (t === "integer") { const n = Number(v); return isNaN(n) || !Number.isInteger(n) }
  if (t === "float") return isNaN(Number(v))
  if (t === "boolean") return v !== true && v !== false && v !== "true" && v !== "false"
  return false
}

function typeIcon(t: FieldType): string {
  switch (t) {
    case "object": return "{ }"
    case "array": return "[ ]"
    case "integer":
    case "float": return "123"
    case "boolean": return "T/F"
    case "null": return "\u2205"
    default: return "abc"
  }
}

function typeLabelShort(t: FieldType): string {
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

function onNameChange(e: Event) {
  store.updateNode(props.node.id, { name: (e.target as HTMLInputElement).value })
}

function onTypeChange(e: Event) {
  store.updateNode(props.node.id, { type: (e.target as HTMLSelectElement).value as FieldType })
}

function onValueChange(e: Event) {
  store.updateNode(props.node.id, { value: (e.target as HTMLInputElement).value })
}

function onColorChange(e: Event) {
  store.updateNode(props.node.id, { value: (e.target as HTMLInputElement).value })
}

function onChildNameChange(childId: string, e: Event) {
  store.updateNode(childId, { name: (e.target as HTMLInputElement).value })
}

function onChildTypeChange(childId: string, e: Event) {
  store.updateNode(childId, { type: (e.target as HTMLSelectElement).value as FieldType })
}

function onChildValueChange(childId: string, e: Event) {
  store.updateNode(childId, { value: (e.target as HTMLInputElement).value })
}

function toggle() {
  store.toggleExpand(props.node.id)
}

function addChild() {
  store.addChildField(props.node.id)
}

function removeNode() {
  store.deleteNode(props.node.id)
}
</script>

<template>
  <!-- ROOT NODE: ER-diagram card, draggable -->
  <div v-if="isRoot"
    class="draggable-er-card absolute bg-white rounded-lg shadow-md border border-slate-200 select-none"
    :style="{ left: (position?.x || 0) + 'px', top: (position?.y || 0) + 'px', minWidth: '260px', maxWidth: '360px' }"
    :data-node-id="node.id">
    <!-- Card header -->
    <div class="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white cursor-move">
      <span class="text-[10px] font-mono opacity-80 flex-shrink-0">{{ typeIcon(node.type) }}</span>
      <input type="text" :value="node.name" @input="onNameChange"
        class="flex-1 text-xs font-semibold bg-transparent border-b border-primary-400/50 hover:border-white/80 focus:border-white focus:outline-none px-0.5 py-0 text-white" />
      <button v-if="isExpandable" @click="addChild" title="Add field"
        class="w-5 h-5 flex items-center justify-center text-[10px] text-primary-200 hover:text-white hover:bg-primary-700 rounded transition-colors flex-shrink-0">+</button>
      <button @click="removeNode" title="Delete"
        class="w-5 h-5 flex items-center justify-center text-[10px] text-primary-200 hover:text-white hover:bg-primary-700 rounded transition-colors flex-shrink-0">&times;</button>
    </div>

    <!-- Card body -->
    <div class="p-2 space-y-0.5">
      <!-- Expanded children as field rows -->
      <template v-if="isExpandable && node.expanded">
        <div v-for="child in (node.children || [])" :key="child.id"
          class="flex items-center gap-1 px-1 py-1 rounded hover:bg-slate-50 group">
          <!-- Expand toggle for nested objects -->
          <button
            v-if="(child.type === 'object' || child.type === 'array') && child.children && child.children.length > 0"
            @click="store.toggleExpand(child.id)"
            class="w-3 h-3 flex items-center justify-center text-[8px] text-slate-400 hover:text-primary-600 rounded flex-shrink-0">{{
              child.expanded ? '\u25BC' : '\u25B6' }}</button>
          <span v-else class="w-3 flex-shrink-0"></span>

          <!-- Type icon -->
          <span class="text-[9px] font-mono font-semibold flex-shrink-0 w-4 text-center" :class="{
            'text-blue-600': child.type === 'object',
            'text-amber-600': child.type === 'array',
            'text-emerald-600': child.type === 'integer' || child.type === 'float',
            'text-purple-600': child.type === 'boolean',
            'text-slate-400': child.type === 'null',
            'text-slate-600': child.type === 'string',
          }">{{ typeIcon(child.type) }}</span>

          <!-- Name -->
          <input type="text" :value="child.name" @input="onChildNameChange(child.id, $event)"
            class="w-18 text-[10px] font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-700 flex-shrink-0" />

          <!-- Type select -->
          <select :value="child.type" @change="onChildTypeChange(child.id, $event)"
            class="text-[9px] bg-slate-100 border border-slate-200 rounded px-1 py-0 text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-400 flex-shrink-0">
            <option v-for="t in fieldTypes" :key="t" :value="t">{{ typeLabelShort(t) }}</option>
          </select>

          <!-- Value / array display with dropdown -->
          <template v-if="child.type === 'array'">
            <div class="flex-1 relative">
              <!-- Array preview header -->
              <div
                class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1 cursor-pointer hover:bg-amber-100 transition-colors"
                @click="toggleArrayDropdown(child.id)">
                <div class="flex items-center gap-1">
                  <span class="text-amber-600 text-[10px] font-mono">["</span>
                  <span class="text-[10px] font-mono text-slate-600 truncate max-w-[120px]">
                    {{ child.children?.[0]?.value || child.children?.[0]?.id?.slice(0, 8) || '' }}
                  </span>
                  <span class="text-amber-600 text-[10px] font-mono">"</span>
                  <span v-if="child.children && child.children.length > 1" class="text-slate-400 text-[10px]">
                    , ...({{ child.children.length }} items)
                  </span>
                  <span v-if="!child.children || child.children.length === 0" class="text-slate-400 text-[10px]">
                    empty
                  </span>
                </div>
                <span class="text-slate-400 text-[10px] transition-transform"
                  :class="{ 'rotate-180': expandedArrays.has(child.id) }">▼</span>
              </div>

              <!-- Dropdown panel -->
              <div v-if="expandedArrays.has(child.id)"
                class="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-hidden flex flex-col min-w-full">
                <!-- Array items list -->
                <div class="flex-1 overflow-y-auto">
                  <div v-for="(item, idx) in child.children || []" :key="item.id"
                    class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
                    <span class="text-[10px] text-slate-400 font-mono w-6 flex-shrink-0">[{{ idx }}]</span>
                    <input type="text" :value="item.value != null ? String(item.value) : ''"
                      @input="store.updateNode(item.id, { value: ($event.target as HTMLInputElement).value })"
                      class="flex-1 text-[10px] font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-600"
                      placeholder="value" />
                    <button @click.stop="store.deleteNode(item.id)"
                      class="text-[10px] text-slate-400 hover:text-red-500 px-1 flex-shrink-0">×</button>
                  </div>
                  <div v-if="!child.children || child.children.length === 0"
                    class="px-2 py-3 text-[10px] text-slate-400 text-center">
                    Empty array
                  </div>
                </div>

                <!-- Action buttons at bottom -->
                <div
                  class="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50/50 to-amber-100/50 border-t border-amber-200/50">
                  <button @click.stop="store.addArrayItem(child.id)"
                    class="flex-1 bg-gradient-to-r from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md flex items-center justify-center gap-1 border-2 border-green-600/30">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add
                  </button>
                  <button v-if="child.children && child.children.length > 0" @click.stop="store.clearArray(child.id)"
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
          <input v-else-if="child.type !== 'object' && !(child.arrayItemType === 'object')" type="text"
            :value="child.value != null ? String(child.value) : ''" @input="onChildValueChange(child.id, $event)"
            class="flex-1 text-[10px] font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-500 min-w-0" />

          <!-- Validation indicator -->
          <span v-if="childValueInvalid(child)" class="text-red-500 font-bold text-[11px] cursor-help flex-shrink-0"
            title="字段类型不匹配">!</span>

          <!-- Delete -->
          <button @click="store.deleteNode(child.id)"
            class="w-4 h-4 flex items-center justify-center text-[9px] text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">&times;</button>
        </div>

        <!-- Recursive nested expanded object/array children -->
        <template v-for="child in (node.children || [])" :key="'sub-' + child.id">
          <div
            v-if="child.expanded && (child.type === 'object' || (child.type === 'array' && child.arrayItemType === 'object')) && child.children && child.children.length > 0"
            class="ml-4 pl-3 border-l-2 border-dashed border-slate-200 mt-0.5 mb-0.5">
            <FieldTreeNode v-for="sub in child.children" :key="sub.id" :node="sub" :depth="props.depth + 2" />
          </div>
        </template>
      </template>

      <!-- Collapsed / empty state -->
      <div v-if="isExpandable && (!hasChildren || !node.expanded)" @click="toggle"
        class="text-[10px] text-slate-400 px-1 py-2 cursor-pointer hover:text-primary-600">{{ hasChildren ?
          (node.children!.length + ' fields') : 'Click + to add fields' }}</div>

      <!-- Non-expandable root node: value input -->
      <div v-if="!isExpandable" class="px-1 py-1 flex items-center gap-1.5">
        <select :value="node.type" @change="onTypeChange"
          class="text-[9px] bg-slate-100 border border-slate-200 rounded px-1 py-0 text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-400">
          <option v-for="t in fieldTypes" :key="t" :value="t">{{ typeLabelShort(t) }}</option>
        </select>
        <div class="flex items-center gap-1 flex-1">
          <input type="text" :value="node.value != null ? String(node.value) : ''" @input="onValueChange"
            class="flex-1 text-xs font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-600" />
          <span v-if="isValueInvalid" class="text-red-500 font-bold text-xs cursor-help flex-shrink-0"
            title="字段类型不匹配">!</span>
          <div v-if="isColorValue" class="relative flex items-center flex-shrink-0">
            <div class="w-4 h-4 rounded-full border border-slate-300 shadow-sm cursor-pointer"
              :style="{ backgroundColor: String(node.value) }"></div>
            <input type="color" :value="String(node.value)" @input="onColorChange"
              class="absolute inset-0 opacity-0 cursor-pointer w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- NESTED NODE: inline field row -->
  <div v-if="!isRoot" class="flex items-center gap-1 px-1 py-1 rounded hover:bg-slate-50 group">
    <button v-if="isExpandable && hasChildren" @click="toggle"
      class="w-3 h-3 flex items-center justify-center text-[8px] text-slate-400 hover:text-primary-600 rounded flex-shrink-0">{{
        node.expanded ? '\u25BC' : '\u25B6' }}</button>
    <span v-else class="w-3 flex-shrink-0"></span>

    <span class="text-[9px] font-mono font-semibold flex-shrink-0 w-4 text-center" :class="{
      'text-blue-600': node.type === 'object',
      'text-amber-600': node.type === 'array',
      'text-emerald-600': node.type === 'integer' || node.type === 'float',
      'text-purple-600': node.type === 'boolean',
      'text-slate-400': node.type === 'null',
      'text-slate-600': node.type === 'string',
    }">{{ typeIcon(node.type) }}</span>

    <input type="text" :value="node.name" @input="onNameChange"
      class="w-18 text-[10px] font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-700 flex-shrink-0" />

    <select :value="node.type" @change="onTypeChange"
      class="text-[9px] bg-slate-100 border border-slate-200 rounded px-1 py-0 text-slate-500 focus:outline-none focus:ring-1 focus:ring-primary-400 flex-shrink-0">
      <option v-for="t in fieldTypes" :key="t" :value="t">{{ typeLabelShort(t) }}</option>
    </select>

    <!-- Array field display with dropdown -->
    <template v-if="node.type === 'array'">
      <div class="flex-1 relative">
        <!-- Array preview header -->
        <div
          class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded px-2 py-1 cursor-pointer hover:bg-amber-100 transition-colors"
          @click="toggleArrayDropdown(node.id)">
          <div class="flex items-center gap-1">
            <span class="text-amber-600 text-[10px] font-mono">["</span>
            <span class="text-[10px] font-mono text-slate-600 truncate max-w-[120px]">
              {{ node.children?.[0]?.value || node.children?.[0]?.id?.slice(0, 8) || '' }}
            </span>
            <span class="text-amber-600 text-[10px] font-mono">"</span>
            <span v-if="node.children && node.children.length > 1" class="text-slate-400 text-[10px]">
              , ...({{ node.children.length }} items)
            </span>
            <span v-if="!node.children || node.children.length === 0" class="text-slate-400 text-[10px]">
              empty
            </span>
          </div>
          <span class="text-slate-400 text-[10px] transition-transform"
            :class="{ 'rotate-180': expandedArrays.has(node.id) }">▼</span>
        </div>

        <!-- Dropdown panel -->
        <div v-if="expandedArrays.has(node.id)"
          class="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-hidden flex flex-col min-w-full">
          <!-- Array items list -->
          <div class="flex-1 overflow-y-auto">
            <div v-for="(item, idx) in node.children || []" :key="item.id"
              class="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 border-b border-slate-100 last:border-b-0">
              <span class="text-[10px] text-slate-400 font-mono w-6 flex-shrink-0">[{{ idx }}]</span>
              <input type="text" :value="item.value != null ? String(item.value) : ''"
                @input="store.updateNode(item.id, { value: ($event.target as HTMLInputElement).value })"
                class="flex-1 text-[10px] font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-600"
                placeholder="value" />
              <button @click.stop="store.deleteNode(item.id)"
                class="text-[10px] text-slate-400 hover:text-red-500 px-1 flex-shrink-0">×</button>
            </div>
            <div v-if="!node.children || node.children.length === 0"
              class="px-2 py-3 text-[10px] text-slate-400 text-center">
              Empty array
            </div>
          </div>

          <!-- Action buttons at bottom -->
          <div
            class="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50/50 to-amber-100/50 border-t border-amber-200/50">
            <button @click.stop="store.addArrayItem(node.id)"
              class="flex-1 bg-gradient-to-r from-green-400 to-green-500 hover:from-green-500 hover:to-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-sm hover:shadow-md flex items-center justify-center gap-1 border-2 border-green-600/30">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
            <button v-if="node.children && node.children.length > 0" @click.stop="store.clearArray(node.id)"
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
    <input v-else-if="node.type !== 'object' && !(node.arrayItemType === 'object')" type="text"
      :value="node.value != null ? String(node.value) : ''" @input="onValueChange"
      class="flex-1 text-[10px] font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-500 focus:outline-none px-0.5 py-0 text-slate-500 min-w-0" />

    <span v-if="isValueInvalid" class="text-red-500 font-bold text-[11px] cursor-help flex-shrink-0"
      title="字段类型不匹配">!</span>

    <button @click="removeNode"
      class="w-4 h-4 flex items-center justify-center text-[9px] text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">&times;</button>
  </div>
</template>
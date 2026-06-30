<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from "vue"
import { useDataStore } from "@/stores/dataStore"
import type { FieldNode } from "@/types"
import EntityBlock from "./EntityBlock.vue"
import interact from "interactjs"
import { nanoid } from "nanoid"

const store = useDataStore()

interface BlockData {
  id: string
  title: string
  fields: FieldNode[]
  parentBlockId?: string
  parentFieldIndex?: number
  depth: number
}

const blocks = ref<BlockData[]>([])

function computeBlocks(nodes: FieldNode[], parentBlockId?: string, parentFieldIndex?: number, depth = 0): BlockData[] {
  const result: BlockData[] = []
  const blockId = parentBlockId || nanoid()

  if (!parentBlockId) {
    result.push({ id: blockId, title: "Root", fields: nodes, depth: 0 })
  }

  nodes.forEach((node, idx) => {
    const pbi = parentBlockId || blockId
    const pfi = idx

    if (node.type === "object" && node.children && node.children.length > 0) {
      const childId = "b-" + node.id
      result.push({
        id: childId, title: node.name, fields: node.children,
        parentBlockId: pbi, parentFieldIndex: pfi, depth: depth + 1,
      })
      result.push(...computeBlocks(node.children, childId, idx, depth + 1))
    } else if (node.type === "array" && node.arrayItemType === "object" && node.children && node.children.length > 0) {
      const childId = "b-" + node.id
      result.push({
        id: childId, title: node.name + " []", fields: node.children,
        parentBlockId: pbi, parentFieldIndex: pfi, depth: depth + 1,
      })
      result.push(...computeBlocks(node.children, childId, idx, depth + 1))
    }
  })

  return result
}

const connectorFieldIds = computed(() => {
  const ids = new Set<string>()
  for (const b of blocks.value) {
    if (b.parentBlockId && b.parentFieldIndex !== undefined) {
      const parentBlock = blocks.value.find(pb => pb.id === b.parentBlockId)
      if (parentBlock && parentBlock.fields[b.parentFieldIndex]) {
        ids.add(parentBlock.fields[b.parentFieldIndex].id)
      }
    }
  }
  return ids
})

const canvasRef = ref<HTMLElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const nodePositions = reactive<Record<string, { x: number; y: number }>>({})
const HEADER_H = 36
const ROW_H = 28
const ROW_PADDING = 6   // p-1.5 = 6px
const ROW_GAP = 2       // space-y-0.5 = 2px
const ROW_STEP = ROW_H + ROW_GAP

// Viewport state for pan and zoom
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isPanning = ref(false)
const panStartX = ref(0)
const panStartY = ref(0)
const startTranslateX = ref(0)
const startTranslateY = ref(0)

// Collapse/expand state for child blocks
const collapsedBlocks = reactive(new Set<string>())

function toggleCollapse(blockId: string) {
  if (collapsedBlocks.has(blockId)) {
    collapsedBlocks.delete(blockId)
  } else {
    collapsedBlocks.add(blockId)
  }
}

function isBlockHidden(blockId: string): boolean {
  if (collapsedBlocks.has(blockId)) return true
  const block = blocks.value.find(b => b.id === blockId)
  if (block?.parentBlockId) return isBlockHidden(block.parentBlockId)
  return false
}

const visibleBlocks = computed(() => {
  return blocks.value.filter(b => !isBlockHidden(b.id))
})

const visibleConnectorLines = computed(() => {
  return connectorLines.value.filter(line => {
    return !isBlockHidden(line.childBlockId)
  })
})

function initBlockPositions() {
  const sortedBlocks = [...blocks.value].sort((a, b) => a.depth - b.depth)
  for (const b of sortedBlocks) {
    if (nodePositions[b.id]) continue
    if (b.depth === 0) {
      nodePositions[b.id] = { x: 24, y: 24 }
    } else {
      const parentBlock = blocks.value.find(pb => pb.id === b.parentBlockId)
      if (parentBlock && b.parentFieldIndex !== undefined) {
        const px = nodePositions[parentBlock.id]?.x ?? 0
        const py = nodePositions[parentBlock.id]?.y ?? 0
        const fieldY = py + HEADER_H + ROW_PADDING + b.parentFieldIndex * ROW_STEP + ROW_H / 2 - HEADER_H / 2
        const siblingSubs = blocks.value.filter(
          sb => sb.parentBlockId === b.parentBlockId && sb.parentFieldIndex !== undefined && sb.parentFieldIndex < b.parentFieldIndex!
        ).length
        nodePositions[b.id] = { x: px + 320, y: fieldY + siblingSubs * 20 }
      }
    }
  }
}

function cleanPositions() {
  const ids = new Set(blocks.value.map(b => b.id))
  for (const key of Object.keys(nodePositions)) {
    if (!ids.has(key)) delete nodePositions[key]
  }
}

// Zoom function
function handleWheel(event: WheelEvent) {
  if (!canvasRef.value) return
  event.preventDefault()

  const rect = canvasRef.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top

  const delta = event.deltaY > 0 ? 0.9 : 1.1
  const newScale = Math.min(Math.max(scale.value * delta, 0.25), 3)

  // Calculate new translation to zoom around mouse point
  const worldX = (mouseX - translateX.value) / scale.value
  const worldY = (mouseY - translateY.value) / scale.value

  scale.value = newScale
  translateX.value = mouseX - worldX * scale.value
  translateY.value = mouseY - worldY * scale.value
}

// Pan functions
function handleMouseDown(event: MouseEvent) {
  if ((event.target as HTMLElement).closest(".er-block, input, select, button, textarea")) return
  if (!canvasRef.value) return

  isPanning.value = true
  panStartX.value = event.clientX
  panStartY.value = event.clientY
  startTranslateX.value = translateX.value
  startTranslateY.value = translateY.value

  document.addEventListener("mousemove", handleMouseMove)
  document.addEventListener("mouseup", handleMouseUp)
}

function handleMouseMove(event: MouseEvent) {
  if (!isPanning.value) return

  translateX.value = startTranslateX.value + (event.clientX - panStartX.value)
  translateY.value = startTranslateY.value + (event.clientY - panStartY.value)
}

function handleMouseUp() {
  isPanning.value = false
  document.removeEventListener("mousemove", handleMouseMove)
  document.removeEventListener("mouseup", handleMouseUp)
}

// Reset view
function resetView() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

watch(() => store.structureVersion, () => {
  blocks.value = computeBlocks(store.fieldTree)
  nextTick(() => {
    cleanPositions()
    initBlockPositions()
    nextTick(() => nextTick(() => setupInteract()))
  })
}, { immediate: true })

interface ConnectorLine {
  fromX: number; fromY: number
  toX: number; toY: number
  childBlockId: string
}

const connectorLines = computed<ConnectorLine[]>(() => {
  const lines: ConnectorLine[] = []
  const BLOCK_WIDTH = 260  // Matches EntityBlock's minWidth
  const RIGHT_PADDING = 6  // px-1.5 = 0.375rem = 6px
  const CONNECTOR_DOT_SIZE = 10  // w-2.5 = 10px
  const CONNECTOR_DOT_CENTER = RIGHT_PADDING + CONNECTOR_DOT_SIZE / 2

  for (const b of blocks.value) {
    if (!b.parentBlockId || b.parentFieldIndex === undefined) continue
    const parentPos = nodePositions[b.parentBlockId]
    const childPos = nodePositions[b.id]
    if (!parentPos || !childPos) continue

    // From: connector dot position on parent block (right side of the field row)
    const fromX = parentPos.x + BLOCK_WIDTH - CONNECTOR_DOT_CENTER
    const fromY = parentPos.y + HEADER_H + ROW_PADDING + b.parentFieldIndex * ROW_STEP + ROW_H / 2

    // To: left side of child block header (centered vertically)
    const toX = childPos.x
    const toY = childPos.y + HEADER_H / 2

    lines.push({ fromX, fromY, toX, toY, childBlockId: b.id })
  }
  return lines
})

function setupInteract() {
  const els = document.querySelectorAll(".er-block")
  if (els.length === 0) return

  interact(".er-block").unset()
  interact(".er-block").draggable({
    ignoreFrom: "input, select, textarea, button",
    inertia: { resistance: 10, minSpeed: 100, endSpeed: 200 },
    modifiers: canvasRef.value ? [
      interact.modifiers.restrictRect({
        restriction: canvasRef.value,
        endOnly: true,
      }),
    ] : [],
    autoScroll: false,
    listeners: {
      move(event) {
        let target = event.target as Element | null
        if (!target || !target.closest) return
        const blockEl = target.closest("[data-block-id]") as HTMLElement | null
        if (!blockEl) return
        const blockId = blockEl.getAttribute("data-block-id")
        if (blockId && nodePositions[blockId]) {
          nodePositions[blockId].x += event.dx
          nodePositions[blockId].y += event.dy
        }
      },
    },
  })
}

onMounted(async () => {
  await nextTick()
  await nextTick()
  blocks.value = computeBlocks(store.fieldTree)
  await nextTick()
  initBlockPositions()
  await nextTick()
  await nextTick()
  setupInteract()
  window.addEventListener('reset-zoom', resetZoom)
})

onBeforeUnmount(() => {
  interact(".er-block").unset()
  window.removeEventListener('reset-zoom', resetZoom)
})

function resetZoom() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

const svgWidth = computed(() => {
  let maxX = 800
  for (const pos of Object.values(nodePositions)) {
    if (pos.x + 300 > maxX) maxX = pos.x + 300
  }
  return maxX + 3000
})
const svgHeight = computed(() => {
  let maxY = 600
  for (const pos of Object.values(nodePositions)) {
    if (pos.y + 300 > maxY) maxY = pos.y + 300
  }
  return maxY + 3000
})
</script>

<template>
  <div class="w-full h-full flex flex-col">
    <div
      class="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-amber-50 to-amber-100/50 backdrop-blur-md border-b border-amber-200/50 z-30">
      <div class="flex items-center gap-3">
        <div class="text-[10px] text-amber-700">
          {{ blocks.length }} blocks &bull; {{ collapsedBlocks.size }} collapsed &bull; drag to arrange
        </div>
        <button @click="resetView"
          class="text-[10px] text-amber-700 hover:text-amber-800 hover:bg-amber-200/50 px-2 py-1 rounded transition-colors">
          Reset View
        </button>
      </div>
      <div class="text-[10px] text-amber-600">
        {{ Math.round(scale * 100) }}%
      </div>
    </div>

    <div ref="canvasRef" class="flex-1 relative overflow-auto apple-notes-bg"
      :style="{ minWidth: svgWidth + 'px', minHeight: svgHeight + 'px' }" @wheel="handleWheel"
      @mousedown="handleMouseDown" :class="{ 'cursor-grabbing': isPanning, 'cursor-grab': !isPanning }">

      <div v-if="blocks.length === 0" class="absolute inset-0 flex items-center justify-center z-10">
        <div class="text-center text-slate-400">
          <div class="text-4xl mb-3">{ }</div>
          <p class="text-sm">Input data in the left panel and click Parse</p>
        </div>
      </div>

      <!-- Connector lines - positioned outside viewport so they're not affected by zoom/pan -->
      <svg class="absolute pointer-events-none z-10" :style="{
        width: svgWidth + 'px',
        height: svgHeight + 'px',
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        transformOrigin: '0 0'
      }">
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#6366F1" />
          </marker>
        </defs>
        <path v-for="(line, i) in visibleConnectorLines" :key="'c' + i"
          :d="'M' + line.fromX + ',' + line.fromY + ' C' + (line.fromX + 40) + ',' + line.fromY + ' ' + (line.toX - 40) + ',' + line.toY + ' ' + line.toX + ',' + line.toY"
          fill="none" stroke="#6366F1" stroke-width="1.5" stroke-dasharray="5,3" marker-end="url(#arrowhead)" />
      </svg>

      <!-- Blocks viewport -->
      <div ref="viewportRef" class="absolute z-20" :style="{
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        transformOrigin: '0 0',
        width: svgWidth + 'px',
        height: svgHeight + 'px'
      }">
        <EntityBlock v-for="block in visibleBlocks" :key="block.id" :blockId="block.id" :blockTitle="block.title"
          :fields="block.fields" :depth="block.depth" :connectorFieldIds="connectorFieldIds"
          :collapsedBlocks="collapsedBlocks" @toggleCollapse="toggleCollapse"
          :style="{ position: 'absolute', left: (nodePositions[block.id]?.x || 0) + 'px', top: (nodePositions[block.id]?.y || 0) + 'px' }" />
      </div>
    </div>
  </div>
</template>
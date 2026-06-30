import { defineStore } from "pinia"
import { ref } from "vue"
import type { FieldNode, InputFormat, OutputFormat, SQLDialect, CaseStyle, ToastMessage } from "@/types"
import { parseToTree } from "@/composables/useParser"
import { generateOutput } from "@/composables/useGenerator"
import { nanoid } from "nanoid"
import { debounce } from "lodash-es"

const SAMPLE_JSON = `{
  "project": "DataTrans",
  "version": 1,
  "config": {
    "host": "localhost",
    "ports": [8080, 8081]
  },
  "user": {
    "name": "Admin",
    "age": 30,
    "score": 99.5,
    "isActive": true,
    "themeColor": "#4F46E5"
  },
  "tags": ["utility", "converter"]
}`

export const useDataStore = defineStore("data", () => {
  const fieldTree = ref<FieldNode[]>([])
  const inputText = ref("")
  const inputFormat = ref<InputFormat>("JSON")
  const outputFormat = ref<OutputFormat>("JSON")
  const outputText = ref("")
  const sqlDialect = ref<SQLDialect>("MySQL")
  const rootClassName = ref("A")
  const caseStyle = ref<CaseStyle>("none")
  const structureVersion = ref(0)
  const toasts = ref<ToastMessage[]>([])

  function addToast(message: string, type: ToastMessage["type"] = "warning") {
    const id = nanoid()
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, 3500)
  }

  function loadSampleData() {
    inputText.value = SAMPLE_JSON
    inputFormat.value = "JSON"
    parseInput()
  }

  function parseInput() {
    const trimmed = inputText.value.trim()
    if (!trimmed) {
      addToast("请输入数据后再解析", "warning")
      return
    }
    try {
      const tree = parseToTree(inputText.value, inputFormat.value)
      if (tree.length === 0) {
        addToast("解析结果为空，请检查输入内容", "warning")
        return
      }
      fieldTree.value = tree
      expandTopLevel(tree)
      structureVersion.value++
      saveHistory()
      performConversion()
      addToast(`成功解析 ${countNodes(tree)} 个字段`, "success")
    } catch (e) {
      const msg = (e as Error).message || String(e)
      if (msg.includes("JSON")) {
        addToast("JSON 格式错误，请检查语法：" + msg, "error")
      } else if (msg.includes("YAML")) {
        addToast("YAML 格式错误，请检查缩进：" + msg, "error")
      } else {
        addToast("解析失败：" + msg, "error")
      }
    }
  }

  function countNodes(nodes: FieldNode[]): number {
    let count = nodes.length
    for (const n of nodes) {
      if (n.children) count += countNodes(n.children)
    }
    return count
  }

  function expandTopLevel(nodes: FieldNode[]) {
    for (const node of nodes) {
      if (node.type === "object" || node.type === "array") {
        node.expanded = true
      }
    }
  }

  function performConversion() {
    if (fieldTree.value.length === 0) {
      outputText.value = ""
      return
    }
    try {
      let tree = fieldTree.value
      if (caseStyle.value !== "none") {
        tree = cloneTreeWithCase(fieldTree.value, caseStyle.value)
      }
      const result = generateOutput(tree, outputFormat.value, {
        dialect: sqlDialect.value,
        rootClassName: rootClassName.value,
      })
      outputText.value = result
      saveHistory()
    } catch (e) {
      addToast("Conversion failed: " + (e as Error).message, "error")
    }
  }

  function cloneTreeWithCase(nodes: FieldNode[], style: "snake" | "camel"): FieldNode[] {
    const convert = style === "snake" ? camelToSnake : snakeToCamel
    return nodes.map(node => ({
      ...node,
      name: convert(node.name),
      children: node.children ? cloneTreeWithCase(node.children, style) : undefined,
    }))
  }

  function snakeToCamel(s: string): string {
    return s.replace(/_+(\w)/g, (_, c: string) => c.toUpperCase())
  }

  function camelToSnake(s: string): string {
    return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "")
  }

  function findNodeById(nodes: FieldNode[], id: string): FieldNode | null {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children) {
        const found = findNodeById(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  function updateNode(nodeId: string, updates: Partial<FieldNode>) {
    const node = findNodeById(fieldTree.value, nodeId)
    if (!node) return

    if (updates.name !== undefined && updates.name !== node.name && (node.type === "object" || node.type === "array")) {
      structureVersion.value++
    }

    if (updates.type !== undefined && updates.type !== node.type) {
      const newType = updates.type
      const oldValue = node.value
      let needsReset = false

      if (newType === "integer") {
        const num = Number(oldValue)
        if (oldValue === "" || oldValue === null || oldValue === undefined || isNaN(num) || !Number.isInteger(num)) {
          needsReset = true
          updates.value = ""
        }
      } else if (newType === "float") {
        const num = Number(oldValue)
        if (oldValue === "" || oldValue === null || oldValue === undefined || isNaN(num)) {
          needsReset = true
          updates.value = ""
        }
      } else if (newType === "boolean") {
        if (oldValue !== true && oldValue !== false && oldValue !== "true" && oldValue !== "false") {
          needsReset = true
          updates.value = false
        }
      } else if (newType === "object" || newType === "array") {
        needsReset = true
        updates.value = undefined
        if (!node.children || node.children.length === 0) {
          updates.children = []
        }
      } else if (newType === "string") {
        if (node.type === "object" || node.type === "array") {
          needsReset = true
          updates.value = ""
        } else if (oldValue === undefined || oldValue === null) {
          updates.value = ""
        }
        updates.children = []
        updates.isArrayRoot = undefined
        updates.arrayItemType = undefined
      }

      const typeIsStructural = (newType === "object" || newType === "array" || node.type === "object" || node.type === "array")
      if (typeIsStructural) structureVersion.value++

      if (needsReset) {
        addToast("Value reset - please re-enter", "warning")
      }
    }

    Object.assign(node, updates)
    debouncedRegenerate()
  }

  function toggleExpand(nodeId: string) {
    const node = findNodeById(fieldTree.value, nodeId)
    if (node && (node.type === "object" || node.type === "array")) {
      node.expanded = !node.expanded
    }
  }

  function addChildField(parentId: string) {
    const parent = findNodeById(fieldTree.value, parentId)
    if (!parent) return
    if (!parent.children) parent.children = []
    const newNode: FieldNode = {
      id: nanoid(),
      name: "newField",
      type: "string",
      value: "",
      parentId,
      expanded: false,
    }
    parent.children.push(newNode)
    parent.expanded = true
    structureVersion.value++
  }

  function deleteNode(nodeId: string) {
    const deleteFrom = (nodes: FieldNode[]): FieldNode[] => {
      return nodes.filter(node => {
        if (node.id === nodeId) return false
        if (node.children) {
          node.children = deleteFrom(node.children)
          // 如果数组变空了，重置 arrayItemType
          if (node.type === "array" && node.children.length === 0) {
            node.arrayItemType = undefined
          }
        }
        return true
      })
    }
    fieldTree.value = deleteFrom(fieldTree.value)
    structureVersion.value++
    debouncedRegenerate()
  }

  function addRootField() {
    const newNode: FieldNode = {
      id: nanoid(),
      name: "newField",
      type: "string",
      value: "",
      parentId: null,
      expanded: false,
    }
    fieldTree.value.push(newNode)
    structureVersion.value++
    debouncedRegenerate()
  }

  function addArrayItem(arrayId: string) {
    const arrayNode = findNodeById(fieldTree.value, arrayId)
    if (!arrayNode || arrayNode.type !== "array") return
    if (!arrayNode.children) arrayNode.children = []

    // 如果数组已有元素，使用第一个元素的类型；否则默认为 string
    const itemType = arrayNode.children.length > 0 ? arrayNode.children[0].type : "string"

    const newItem: FieldNode = {
      id: nanoid(),
      name: `[${arrayNode.children.length}]`,
      type: itemType,
      value: itemType === "object" ? undefined : "",
      parentId: arrayId,
      expanded: false,
    }

    if (itemType === "object") {
      newItem.children = []
    }

    arrayNode.children.push(newItem)
    structureVersion.value++
    debouncedRegenerate()
  }

  function clearArray(arrayId: string) {
    const arrayNode = findNodeById(fieldTree.value, arrayId)
    if (!arrayNode || arrayNode.type !== "array") return
    arrayNode.children = []
    arrayNode.arrayItemType = undefined  // 重置数组元素类型
    structureVersion.value++
    debouncedRegenerate()
  }

  const debouncedRegenerate = debounce(() => {
    if (fieldTree.value.length > 0) {
      performConversion()
    }
  }, 300)

  // --- History persistence ---
  const HISTORY_KEY = 'datatrans_history'

  function saveHistory() {
    try {
      const data = {
        inputText: inputText.value,
        outputText: outputText.value,
        inputFormat: inputFormat.value,
        outputFormat: outputFormat.value,
        rootClassName: rootClassName.value,
        sqlDialect: sqlDialect.value,
        timestamp: Date.now()
      }
      localStorage.setItem(HISTORY_KEY, JSON.stringify(data))
    } catch {
      // localStorage may be full or unavailable
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (!raw) return false
      const data = JSON.parse(raw)
      inputText.value = data.inputText || ''
      outputText.value = data.outputText || ''
      inputFormat.value = data.inputFormat || 'JSON'
      outputFormat.value = data.outputFormat || 'JSON'
      rootClassName.value = data.rootClassName || 'A'
      sqlDialect.value = data.sqlDialect || 'MySQL'
      return true
    } catch {
      return false
    }
  }

  return {
    fieldTree,
    inputText,
    inputFormat,
    outputFormat,
    outputText,
    sqlDialect,
    rootClassName,
    structureVersion,
    toasts,
    loadSampleData,
    parseInput,
    performConversion,
    updateNode,
    toggleExpand,
    addRootField,
    addChildField,
    deleteNode,
    addArrayItem,
    clearArray,
    caseStyle,
    addToast,
    saveHistory,
    loadHistory,
  }
})
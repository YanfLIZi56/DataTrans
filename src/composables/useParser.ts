import type { FieldNode, InputFormat, FieldType } from "@/types"
import { nanoid } from "nanoid"
import yaml from "js-yaml"
import Papa from "papaparse"

// --- Public API ---

export function parseToTree(text: string, format: InputFormat): FieldNode[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  let obj: unknown
  switch (format) {
    case "JSON":
      obj = JSON.parse(trimmed)
      break
    case "YAML":
      obj = yaml.load(trimmed)
      break
    case "CSV":
      obj = parseCSV(trimmed)
      break
    case "SQL(DDL)":
      obj = parseSQLDDL(trimmed)
      break
    case "ES Mapping":
      obj = parseESMapping(trimmed)
      break
    case "TOML":
      obj = parseTOML(trimmed)
      break
    default:
      throw new Error("Unsupported input format: " + format)
  }
  return buildTree(obj)
}

// --- Type inference ---

function inferType(value: unknown): { type: FieldType; decimalPlaces?: number } {
  if (value === null || value === undefined) return { type: "null" }
  if (Array.isArray(value)) return { type: "array" }
  if (typeof value === "object") return { type: "object" }
  if (typeof value === "boolean") return { type: "boolean" }
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { type: "integer" }
    const decimalStr = String(value).split(".")[1] || ""
    return { type: "float", decimalPlaces: decimalStr.length }
  }
  return { type: "string" }
}

// --- Tree builder (recursive) ---

function buildTree(obj: unknown, parentId?: string): FieldNode[] {
  if (obj === null || obj === undefined) return []

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return [{
        id: nanoid(), name: "items", type: "array",
        value: undefined, parentId: parentId || null, expanded: false,
        children: [],
      }]
    }
    const first = obj[0]
    if (typeof first === "object" && first !== null && !Array.isArray(first)) {
      // Object array: store each object as a JSON string
      const arrayId = nanoid()
      const children = obj.map((item, i) => ({
        id: nanoid(),
        name: "[" + i + "]",
        type: "string",
        value: JSON.stringify(item),
        parentId: arrayId,
        expanded: false,
      } as FieldNode))
      return [{
        id: arrayId, name: "items", type: "array",
        value: undefined, parentId: parentId || null, expanded: false,
        isArrayRoot: true, arrayItemType: "object",
        children,
      }]
    } else {
      // Primitive array: create indexed children
      const itemType = inferType(first)
      const children = obj.map((item, i) => ({
        id: nanoid(),
        name: "[" + i + "]",
        type: itemType.type,
        value: item,
        parentId: parentId || null,
      } as FieldNode))
      return [{
        id: nanoid(), name: "items", type: "array",
        value: undefined, parentId: parentId || null, expanded: false,
        arrayItemType: itemType.type,
        children,
      }]
    }
  }

  if (typeof obj === "object" && obj !== null) {
    return Object.entries(obj as Record<string, unknown>).map(([key, value]) => {
      const inferred = inferType(value)
      const node: FieldNode = {
        id: nanoid(),
        name: key,
        type: inferred.type,
        value: (inferred.type === "object" || inferred.type === "array") ? undefined : value,
        parentId: parentId || null,
        expanded: false,
        decimalPlaces: inferred.decimalPlaces,
      }

      if (inferred.type === "object" && value !== null) {
        node.children = buildTree(value, node.id)
      } else if (inferred.type === "array" && Array.isArray(value)) {
        const arr = value as unknown[]
        if (arr.length > 0) {
          const firstItem = arr[0]
          if (typeof firstItem === "object" && firstItem !== null && !Array.isArray(firstItem)) {
            // Object array: use first item as template
            node.children = buildTree(firstItem, node.id)
            node.isArrayRoot = true
            node.arrayItemType = "object"
          } else {
            // Primitive array: create indexed children
            const itemType = inferType(firstItem)
            node.arrayItemType = itemType.type
            node.children = arr.map((item, i) => ({
              id: nanoid(),
              name: "[" + i + "]",
              type: itemType.type,
              value: item,
              parentId: node.id,
              decimalPlaces: itemType.decimalPlaces,
            } as FieldNode))
          }
        } else {
          node.children = []
          node.arrayItemType = "string"
        }
      }

      return node
    })
  }

  return []
}

// --- Format-specific parsers ---

function parseCSV(text: string): Record<string, unknown> {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  })
  if (result.errors.length > 0) {
    throw new Error("CSV parse error: " + result.errors[0].message)
  }
  const fields = result.meta.fields
  if (!fields || fields.length === 0) {
    throw new Error("CSV has no header fields")
  }
  const singleRow: Record<string, unknown> = {}
  for (const field of fields) {
    singleRow[field] = ""
  }
  return singleRow
}

function parseSQLDDL(text: string): Record<string, unknown> {
  const tableMatch = text.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?\w+`?\s*\(([\s\S]*)\)\s*;?/i)
  if (!tableMatch) {
    throw new Error("Could not parse CREATE TABLE statement")
  }
  const columnsBlock = tableMatch[1]

  const columns: Record<string, unknown> = {}
  const colDefs = splitColumnDefs(columnsBlock)

  for (const def of colDefs) {
    const trimmed = def.trim()
    if (!trimmed || /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK|FOREIGN)/i.test(trimmed)) continue

    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    let colName = parts[0].replace(/[`"]/g, "")
    const colType = parts[1].toUpperCase()

    let jsValue: unknown = ""

    if (/^(INT|INTEGER|BIGINT|SMALLINT|TINYINT|MEDIUMINT|SERIAL)/i.test(colType)) {
      jsValue = 0
    } else if (/^(DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)/i.test(colType)) {
      jsValue = 0.0
    } else if (/^(BOOL|BOOLEAN|BIT)/i.test(colType)) {
      jsValue = false
    } else if (/^(JSON|JSONB)/i.test(colType)) {
      jsValue = { key: "value" }
    } else if (/^(DATE|DATETIME|TIMESTAMP|TIME|YEAR)/i.test(colType)) {
      jsValue = "2024-01-01"
    }

    columns[colName] = jsValue
  }

  return columns
}

function splitColumnDefs(block: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ""
  for (const ch of block) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  if (current.trim()) result.push(current)
  return result
}

function parseESMapping(text: string): Record<string, unknown> {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error("ES Mapping must be valid JSON")
  }
  const extractProps = (node: unknown): Record<string, unknown> => {
    if (typeof node !== "object" || node === null) return {}
    const n = node as Record<string, unknown>
    if (n.properties && typeof n.properties === "object") {
      return esPropsToValues(n.properties as Record<string, unknown>)
    }
    if (n.mappings && typeof n.mappings === "object") {
      const m = n.mappings as Record<string, unknown>
      if (m.properties) return esPropsToValues(m.properties as Record<string, unknown>)
    }
    // 扁平格式：{ "fieldName": { "type": "keyword" }, ... }
    if (isFlatESMapping(n)) {
      return esPropsToValues(n)
    }
    return {}
  }

  function isFlatESMapping(node: Record<string, unknown>): boolean {
    const keys = Object.keys(node)
    if (keys.length === 0) return false
    // 检查第一个值是否像 ES 字段定义（包含 type 属性）
    const firstVal = node[keys[0]]
    return typeof firstVal === "object" && firstVal !== null && "type" in (firstVal as Record<string, unknown>)
  }
  return extractProps(obj)
}

function esPropsToValues(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(props)) {
    if (typeof def === "object" && def !== null) {
      const d = def as Record<string, unknown>
      const esType = (d.type as string) || "keyword"
      result[key] = esTypeToValue(esType)
    }
  }
  return result
}

function esTypeToValue(esType: string): unknown {
  switch (esType) {
    case "long": case "integer": case "short": case "byte": return 0
    case "float": case "double": case "half_float": case "scaled_float": return 0.0
    case "boolean": return false
    case "nested": case "object": return { key: "value" }
    default: return ""
  }
}

// --- TOML Parser ---

function parseTOML(text: string): Record<string, unknown> {
  const lines = text.split("\n")
  const root: Record<string, unknown> = {}
  let currentTable: Record<string, unknown> = root
  const tablePath: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.split("#")[0].trim() // 去掉注释
    if (!line) continue

    // 表头 [section] 或 [[array]]
    const tableMatch = line.match(/^\[\[(.+)\]\]$/)
    const sectionMatch = line.match(/^\[(.+)\]$/)

    if (tableMatch) {
      const path = tableMatch[1].split(".").map(s => s.trim())
      currentTable = ensureNestedArray(root, path)
      tablePath.length = 0
      continue
    }
    if (sectionMatch) {
      const path = sectionMatch[1].split(".").map(s => s.trim())
      currentTable = ensureNested(root, path)
      tablePath.length = 0
      continue
    }

    // 键值对
    const eqIdx = line.indexOf("=")
    if (eqIdx === -1) continue

    const key = line.slice(0, eqIdx).trim()
    const valueStr = line.slice(eqIdx + 1).trim()
    currentTable[key] = parseTOMLValue(valueStr)
  }

  return root
}

function ensureNested(obj: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current = obj
  for (const key of path) {
    if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  return current
}

function ensureNestedArray(obj: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const lastKey = path[path.length - 1]
  const parent = path.length > 1 ? ensureNested(obj, path.slice(0, -1)) : obj

  if (!Array.isArray(parent[lastKey])) {
    parent[lastKey] = []
  }
  const arr = parent[lastKey] as Record<string, unknown>[]
  const newItem: Record<string, unknown> = {}
  arr.push(newItem)
  return newItem
}

function parseTOMLValue(raw: string): unknown {
  raw = raw.trim()

  // 字符串
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }

  // 多行字符串
  if (raw.startsWith('"""') || raw.startsWith("'''")) return raw

  // 布尔
  if (raw === "true") return true
  if (raw === "false") return false

  // 内联数组
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return []
    return splitArrayValues(inner).map(parseTOMLValue)
  }

  // 内联表
  if (raw.startsWith("{") && raw.endsWith("}")) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return {}
    const obj: Record<string, unknown> = {}
    for (const pair of splitArrayValues(inner)) {
      const eqIdx = pair.indexOf("=")
      if (eqIdx === -1) continue
      obj[pair.slice(0, eqIdx).trim()] = parseTOMLValue(pair.slice(eqIdx + 1))
    }
    return obj
  }

  // 数字
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)

  return raw
}

function splitArrayValues(s: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ""
  for (const ch of s) {
    if (ch === "[" || ch === "{") depth++
    else if (ch === "]" || ch === "}") depth--
    if (ch === "," && depth === 0) {
      result.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  if (current.trim()) result.push(current.trim())
  return result
}
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
    case "Java Object":
      obj = parseJavaObject(trimmed)
      break
    case "Python Object":
      obj = parsePythonObject(trimmed)
      break
    case "Go Object":
      obj = parseGoObject(trimmed)
      break
    case "ES Mapping":
      obj = parseESMapping(trimmed)
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

function parseCSV(text: string): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  })
  if (result.errors.length > 0) {
    throw new Error("CSV parse error: " + result.errors[0].message)
  }
  return result.data
}

function parseSQLDDL(text: string): Record<string, unknown> {
  const tableMatch = text.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\x60?)(\w+)(?:\x60?)\s*\x28([\s\S]+)\x29\s*;?\s*$/i)
  if (!tableMatch) {
    throw new Error("Could not parse CREATE TABLE statement")
  }
  const tableName = tableMatch[1]
  const columnsBlock = tableMatch[2]

  const columns: Record<string, unknown> = {}
  const colDefs = splitColumnDefs(columnsBlock)

  for (const def of colDefs) {
    const trimmed = def.trim()
    if (!trimmed || /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|CHECK|FOREIGN)/i.test(trimmed)) continue

    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    let colName = parts[0].replace(/[\x60"]/g, "")
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

  return { [tableName]: columns }
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

function parseJavaObject(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const fieldRegex = /(?:private|public|protected)\s+(\w+(?:<[^>]+>)?)\s+(\w+)\s*[=;]/g
  let match: RegExpExecArray | null
  while ((match = fieldRegex.exec(text)) !== null) {
    const typeName = match[1]
    const fieldName = match[2]
    fields[fieldName] = javaTypeToValue(typeName)
  }
  return fields
}

function javaTypeToValue(typeName: string): unknown {
  if (/^int(eger)?$/i.test(typeName) || /^long$/i.test(typeName) || /^short$/i.test(typeName)) return 0
  if (/^float$/i.test(typeName) || /^double$/i.test(typeName) || /BigDecimal/.test(typeName)) return 0.0
  if (/^bool(ean)?$/i.test(typeName)) return false
  if (/^List|^Set|^Map|^Collection/.test(typeName)) return ["item"]
  if (/^String$/i.test(typeName)) return ""
  return typeName
}

function parsePythonObject(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const fieldRegex = /(\w+)\s*:\s*(\w+(?:\[[^\]]*\])?)\s*(?:=\s*([^,\n]+))?/g
  let match: RegExpExecArray | null
  while ((match = fieldRegex.exec(text)) !== null) {
    const fieldName = match[1]
    const typeName = match[2]
    const defaultValue = match[3]?.trim()
    fields[fieldName] = pythonTypeToValue(typeName, defaultValue)
  }
  return fields
}

function pythonTypeToValue(typeName: string, defaultVal?: string): unknown {
  if (defaultVal !== undefined) {
    if (defaultVal === "None") return null
    if (defaultVal === "True") return true
    if (defaultVal === "False") return false
    const num = Number(defaultVal)
    if (!isNaN(num)) return num
    return defaultVal.replace(/^['"]|['"]$/g, "")
  }
  if (/^int$/i.test(typeName)) return 0
  if (/^float$/i.test(typeName)) return 0.0
  if (/^bool$/i.test(typeName)) return false
  if (/^List|^Dict|^Set|^Tuple/.test(typeName)) return ["item"]
  if (/^str$/i.test(typeName)) return ""
  return typeName
}

function parseGoObject(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  const structRegex = /type\s+\w+\s+struct\s*\{([^}]+)\}/s
  const structMatch = text.match(structRegex)
  if (!structMatch) return fields

  const body = structMatch[1]
  const fieldRegex = /(\w+)\s+(?:\[\])?(\w+(?:\.\w+)*)\s*(?:\x60[^\x60]*\x60)?/g
  let match: RegExpExecArray | null
  while ((match = fieldRegex.exec(body)) !== null) {
    const fieldName = match[1]
    const typeName = match[2]
    fields[fieldName] = goTypeToValue(typeName)
  }
  return fields
}

function goTypeToValue(typeName: string): unknown {
  if (/^int(8|16|32|64)?$/.test(typeName) || /^uint/.test(typeName)) return 0
  if (/^float(32|64)$/.test(typeName)) return 0.0
  if (/^bool$/i.test(typeName)) return false
  if (/^string$/i.test(typeName)) return ""
  if (/^\[\]/.test(typeName)) return ["item"]
  return typeName
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
    return {}
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
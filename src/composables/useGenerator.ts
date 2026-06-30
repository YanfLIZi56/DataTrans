import type { FieldNode, OutputFormat, SQLDialect } from '@/types'
import yaml from 'js-yaml'

export interface GeneratorOptions {
  dialect: SQLDialect
  rootClassName: string
}

export function generateOutput(tree: FieldNode[], format: OutputFormat, options: GeneratorOptions): string {
  switch (format) {
    case 'JSON': return generateJSON(tree)
    case 'YAML': return generateYAML(tree)
    case 'SQL (建表)': return generateSQLDDL(tree, options)
    case 'SQL (新增)': return generateSQLInsert(tree, options)
    case 'SQL (查询)': return generateSQLSelect(tree, options)
    case 'SQL (更新)': return generateSQLUpdate(tree, options)
    case 'Java POJO': return generateJava(tree, options)
    case 'Python Dataclass': return generatePython(tree, options)
    case 'Go Struct': return generateGo(tree, options)
    case 'ES Mapping': return generateESMapping(tree)
    case 'TypeScript Interface': return generateTypeScript(tree, options)
    case 'TOML': return generateTOML(tree)
    default: return ''
  }
}

// --- Rebuild object from tree (for JSON/YAML output) ---

function treeToObject(nodes: FieldNode[]): unknown {
  if (nodes.length === 0) return {}
  const result: Record<string, unknown> = {}
  for (const node of nodes) {
    if (node.type === 'object' && node.children && node.children.length > 0) {
      result[node.name] = treeToObject(node.children)
    } else if (node.type === 'object') {
      result[node.name] = {}
    } else if (node.type === 'array') {
      if (node.children && node.children.length > 0) {
        result[node.name] = node.children.map(child => {
          let val = child.value
          // 如果是对象类型，尝试解析 JSON 字符串
          if (child.type === 'string' && node.arrayItemType === 'object') {
            if (val && typeof val === 'string') {
              try {
                return JSON.parse(val)
              } catch {
                return val
              }
            }
            return val || {}
          }
          // 根据每个元素自己的类型进行转换
          if (child.type === 'integer') {
            const num = parseInt(String(val), 10)
            val = isNaN(num) ? val : num
          } else if (child.type === 'float') {
            const num = parseFloat(String(val))
            val = isNaN(num) ? val : num
          } else if (child.type === 'boolean') {
            val = val === true || val === 'true'
          } else if (val === undefined || val === null) {
            val = ''
          }
          return val
        })
      } else {
        const parsed = tryParseValue(node.value)
        result[node.name] = parsed !== undefined ? parsed : []
      }
    } else {
      let val = node.value
      if (node.type === 'integer') {
        const num = parseInt(String(val), 10)
        val = isNaN(num) ? val : num
      } else if (node.type === 'float') {
        const num = parseFloat(String(val))
        val = isNaN(num) ? val : num
      } else if (node.type === 'boolean') {
        val = val === true || val === 'true'
      } else if (val === undefined || val === null) {
        val = ''
      }
      result[node.name] = val
    }
  }
  return result
}

function ensureStringValue(node: FieldNode): unknown {
  if (node.type === 'string') {
    return node.value !== undefined && node.value !== null ? node.value : ''
  }
  return node.value
}

function tryParseValue(value: unknown): unknown {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}

function generateJSON(tree: FieldNode[]): string {
  const obj = treeToObject(tree)
  return JSON.stringify(obj, null, 2)
}

function generateYAML(tree: FieldNode[]): string {
  const obj = treeToObject(tree)
  return yaml.dump(obj, {
    indent: 2,
    noArrayIndent: true,
    skipInvalid: true,
    sortKeys: false
  })
}

function toYAML(obj: unknown, indent: number): string {
  const pad = '  '.repeat(indent)
  if (obj === null || obj === undefined) return pad + 'null'
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#') || obj.includes("'") || obj === '')
      return pad + `"${obj.replace(/"/g, '\\"')}"`
    return pad + obj
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return pad + String(obj)
  if (Array.isArray(obj)) {
    if (obj.length === 0) return pad + '[]'
    return obj.map((item) => {
      if (typeof item === 'object' && item !== null) {
        const inner = toYAML(item, indent + 1)
        return pad + '- ' + inner.slice((indent + 1) * 2)
      }
      return pad + '- ' + toYAML(item, 0).trim()
    }).join('\n')
  }
  if (typeof obj === 'object' && obj !== null) {
    const entries = Object.entries(obj as Record<string, unknown>)
    if (entries.length === 0) return pad + '{}'
    return entries.map(([k, v]) => {
      const valStr = toYAML(v, indent + 1)
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return pad + k + ':\n' + valStr.slice((indent + 1) * 2)
      }
      return pad + k + ': ' + valStr.trim()
    }).join('\n')
  }
  return pad + String(obj)
}

// --- SQL Generators ---

function sqlType(node: FieldNode, dialect: SQLDialect): string {
  switch (node.type) {
    case 'string': return 'VARCHAR(255)'
    case 'integer': return dialect === 'PostgreSQL' ? 'INTEGER' : 'INT'
    case 'float': {
      const dp = node.decimalPlaces || 2
      return `DECIMAL(10,${dp})`
    }
    case 'boolean': return dialect === 'SQL Server' ? 'BIT' : 'BOOLEAN'
    case 'object': return dialect === 'PostgreSQL' ? 'JSONB' : 'JSON'
    case 'array': return dialect === 'PostgreSQL' ? 'JSONB' : 'JSON'
    case 'null': return 'VARCHAR(255)'
    default: return 'VARCHAR(255)'
  }
}

function quoteIdentSQL(name: string, dialect: SQLDialect): string {
  switch (dialect) {
    case 'MySQL': return '`' + name + '`'
    case 'PostgreSQL': return '"' + name + '"'
    case 'SQL Server': return '[' + name + ']'
  }
}

function generateSQLDDL(tree: FieldNode[], options: GeneratorOptions): string {
  const tableName = 'tb_' + options.rootClassName
  const cols = tree
    .filter(n => n.type !== 'object' && n.type !== 'array')
    .map(n => `  ${quoteIdentSQL(n.name, options.dialect)} ${sqlType(n, options.dialect)}`)
  return `CREATE TABLE ${quoteIdentSQL(tableName, options.dialect)} (\n${cols.join(',\n')}\n);`
}

function generateSQLInsert(tree: FieldNode[], options: GeneratorOptions): string {
  const tableName = 'tb_' + options.rootClassName
  const flatFields = flattenFields(tree, '')
  const names = flatFields.map(f => f.path)
  const values = flatFields.map(f => sqlLiteralValue(f.node, options.dialect))
  return `INSERT INTO ${quoteIdentSQL(tableName, options.dialect)} (${names.join(', ')})\nVALUES (${values.join(', ')});\n-- TODO: Add WHERE clause as needed`
}

function generateSQLSelect(tree: FieldNode[], options: GeneratorOptions): string {
  const tableName = 'tb_' + options.rootClassName
  const flatFields = flattenFields(tree, '')
  const names = flatFields.map(f => f.path)
  return `SELECT ${names.join(', ')}\nFROM ${quoteIdentSQL(tableName, options.dialect)}\n-- TODO: Add WHERE clause as needed;`
}

function generateSQLUpdate(tree: FieldNode[], options: GeneratorOptions): string {
  const tableName = 'tb_' + options.rootClassName
  const flatFields = flattenFields(tree, '')
  const sets = flatFields.map(f => `${f.path} = ${sqlLiteralValue(f.node, options.dialect)}`)
  return `UPDATE ${quoteIdentSQL(tableName, options.dialect)}\nSET ${sets.join(', ')}\n-- TODO: Add WHERE clause as needed;`
}

interface FlatField { path: string; node: FieldNode }

function flattenFields(nodes: FieldNode[], prefix: string): FlatField[] {
  const result: FlatField[] = []
  for (const node of nodes) {
    const path = prefix ? `${prefix}.${node.name}` : node.name
    if (node.type === 'object' || node.type === 'array') continue
    result.push({ path, node })
  }
  return result
}

function sqlLiteralValue(node: FieldNode, _dialect: SQLDialect): string {
  if (node.type === 'string') {
    const val = node.value === undefined || node.value === null ? '' : String(node.value)
    return `'${val.replace(/'/g, "''")}'`
  }
  if (node.type === 'integer' || node.type === 'float') return String(node.value || 0)
  if (node.type === 'boolean') return node.value ? 'TRUE' : 'FALSE'
  if (node.value === null || node.value === undefined) return 'NULL'
  return `'${String(node.value).replace(/'/g, "''")}'`
}

// --- Java POJO Generator ---

function generateJava(tree: FieldNode[], options: GeneratorOptions): string {
  const className = options.rootClassName
  const fields = generateJavaFields(tree, options.rootClassName)
  return `public class ${className} {\n${fields}\n}`
}

function generateJavaFields(nodes: FieldNode[], parentClassName: string, indent = 4): string {
  const pad = ' '.repeat(indent)
  let result = ''
  for (const node of nodes) {
    const javaType = javaFieldType(node)
    result += `${pad}private ${javaType} ${node.name};\n`
    if (node.type === 'object' && node.children) {
      const innerClassName = capitalize(node.name)
      result += `\n${pad}public static class ${innerClassName} {\n`
      result += generateJavaFields(node.children, innerClassName, indent + 4)
      result += `${pad}}\n`
    }
    if (node.type === 'array' && node.arrayItemType === 'object' && node.children) {
      const innerClassName = capitalize(node.name) + 'Item'
      result += `\n${pad}public static class ${innerClassName} {\n`
      result += generateJavaFields(node.children, innerClassName, indent + 4)
      result += `${pad}}\n`
    }
  }
  return result
}

function javaFieldType(node: FieldNode): string {
  switch (node.type) {
    case 'string': return 'String'
    case 'integer': return 'Integer'
    case 'float': return 'BigDecimal'
    case 'boolean': return 'Boolean'
    case 'object': return capitalize(node.name)
    case 'array':
      if (node.arrayItemType === 'object') return `List<${capitalize(node.name)}Item>`
      return `List<${javaPrimitiveType(node.arrayItemType || 'string')}>`
    default: return 'String'
  }
}

function javaPrimitiveType(t: string): string {
  switch (t) {
    case 'string': return 'String'
    case 'integer': return 'Integer'
    case 'float': return 'BigDecimal'
    case 'boolean': return 'Boolean'
    default: return 'String'
  }
}

// --- Python Dataclass Generator ---

function generatePython(tree: FieldNode[], options: GeneratorOptions): string {
  const className = options.rootClassName
  const lines: string[] = ['from dataclasses import dataclass', 'from typing import List, Optional', '', '@dataclass']
  lines.push(`class ${className}:`)
  const bodyLines = generatePythonFields(tree, 4)
  if (bodyLines.length === 0) {
    lines.push('    pass')
  } else {
    lines.push(...bodyLines)
  }
  return lines.join('\n')
}

function generatePythonFields(nodes: FieldNode[], indent: number): string[] {
  const pad = ' '.repeat(indent)
  const lines: string[] = []
  for (const node of nodes) {
    const pyType = pythonFieldType(node)
    const defaultVal = pythonDefault(node)
    lines.push(`${pad}${node.name}: ${pyType}${defaultVal}`)
    if (node.type === 'object' && node.children) {
      const innerClass = capitalize(node.name)
      lines.push('')
      lines.push(`${pad}@dataclass`)
      lines.push(`${pad}class ${innerClass}:`)
      lines.push(...generatePythonFields(node.children, indent + 4))
    }
    if (node.type === 'array' && node.arrayItemType === 'object' && node.children) {
      const innerClass = capitalize(node.name) + 'Item'
      lines.push('')
      lines.push(`${pad}@dataclass`)
      lines.push(`${pad}class ${innerClass}:`)
      lines.push(...generatePythonFields(node.children, indent + 4))
    }
  }
  return lines
}

function pythonFieldType(node: FieldNode): string {
  switch (node.type) {
    case 'string': return 'str'
    case 'integer': return 'int'
    case 'float': return 'float'
    case 'boolean': return 'bool'
    case 'object': return capitalize(node.name)
    case 'array':
      if (node.arrayItemType === 'object') return `List[${capitalize(node.name)}Item]`
      return `List[${pythonPrimitiveType(node.arrayItemType || 'string')}]`
    default: return 'Optional[str]'
  }
}

function pythonPrimitiveType(t: string): string {
  switch (t) {
    case 'string': return 'str'
    case 'integer': return 'int'
    case 'float': return 'float'
    case 'boolean': return 'bool'
    default: return 'str'
  }
}

function pythonDefault(node: FieldNode): string {
  if (node.value === null || node.value === undefined || node.value === '') {
    return ' = None'
  }
  if (node.type === 'string') return ` = '${String(node.value).replace(/'/g, "\\'")}'`
  if (node.type === 'boolean') return ` = ${node.value ? 'True' : 'False'}`
  return ` = ${node.value}`
}

// --- Go Struct Generator ---

function generateGo(tree: FieldNode[], options: GeneratorOptions): string {
  const structName = options.rootClassName
  const lines = generateGoStruct(tree, structName)
  return lines.join('\n')
}

function generateGoStruct(nodes: FieldNode[], structName: string): string[] {
  const lines: string[] = [`type ${structName} struct {`]
  const fieldLines = generateGoFields(nodes, 1, structName)
  if (fieldLines.length === 0) {
    lines.push('}')
  } else {
    lines.push(...fieldLines)
    lines.push('}')
  }
  return lines
}

function generateGoFields(nodes: FieldNode[], tabCount: number, parentName: string): string[] {
  const pad = '\t'.repeat(tabCount)
  const lines: string[] = []
  for (const node of nodes) {
    const goType = goFieldType(node)
    const jsonTag = `\`json:"${node.name}"\``
    lines.push(`${pad}${capitalize(node.name)} ${goType} ${jsonTag}`)
    if (node.type === 'object' && node.children) {
      const innerName = capitalize(node.name)
      lines.push('')
      lines.push(...generateGoStruct(node.children, innerName))
    }
    if (node.type === 'array' && node.arrayItemType === 'object' && node.children) {
      const innerName = capitalize(node.name) + 'Item'
      lines.push('')
      lines.push(...generateGoStruct(node.children, innerName))
    }
  }
  return lines
}

function goFieldType(node: FieldNode): string {
  switch (node.type) {
    case 'string': return 'string'
    case 'integer': return 'int'
    case 'float': return 'float64'
    case 'boolean': return 'bool'
    case 'object': return '*' + capitalize(node.name)
    case 'array':
      if (node.arrayItemType === 'object') return `[]${capitalize(node.name)}Item`
      return `[]${goPrimitiveType(node.arrayItemType || 'string')}`
    default: return 'string'
  }
}

function goPrimitiveType(t: string): string {
  switch (t) {
    case 'string': return 'string'
    case 'integer': return 'int'
    case 'float': return 'float64'
    case 'boolean': return 'bool'
    default: return 'string'
  }
}

// --- ES Mapping Generator ---

function generateESMapping(tree: FieldNode[]): string {
  const props = generateESProperties(tree)
  return JSON.stringify({ mappings: { properties: props } }, null, 2)
}

function generateESProperties(nodes: FieldNode[]): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const node of nodes) {
    if (node.type === 'object' && node.children) {
      props[node.name] = {
        type: 'nested',
        properties: generateESProperties(node.children),
      }
    } else if (node.type === 'array') {
      if (node.arrayItemType === 'object' && node.children) {
        props[node.name] = {
          type: 'nested',
          properties: generateESProperties(node.children),
        }
      } else {
        props[node.name] = { type: esFieldType(node.arrayItemType || 'string') }
      }
    } else {
      props[node.name] = { type: esFieldType(node.type) }
    }
  }
  return props
}

function esFieldType(t: string): string {
  switch (t) {
    case 'string': return 'keyword'
    case 'integer': return 'long'
    case 'float': return 'double'
    case 'boolean': return 'boolean'
    case 'null': return 'keyword'
    default: return 'keyword'
  }
}

// --- Utility ---

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// --- TypeScript Interface Generator ---

function generateTypeScript(tree: FieldNode[], options: GeneratorOptions): string {
  const interfaces = collectTypeScriptInterfaces(tree, options)
  return interfaces.map(i => i.code).join('\n\n')
}

interface TSInterface {
  name: string
  code: string
}

function collectTypeScriptInterfaces(nodes: FieldNode[], options: GeneratorOptions): TSInterface[] {
  const result: TSInterface[] = []
  const topLevel = generateTSInterfaceBody(nodes, options, result, 0)
  result.unshift({ name: options.rootClassName, code: topLevel })
  return result
}

function generateTSInterfaceBody(
  nodes: FieldNode[],
  options: GeneratorOptions,
  allInterfaces: TSInterface[],
  indent: number
): string {
  const pad = '  '.repeat(indent)
  const lines: string[] = []
  lines.push(`${pad}export interface ${options.rootClassName} {`)

  for (const node of nodes) {
    const tsType = tsFieldType(node, options, allInterfaces)
    const optional = node.type === 'null' ? '?' : ''
    lines.push(`${pad}  ${node.name}${optional}: ${tsType};`)
  }

  lines.push(`${pad}}`)
  return lines.join('\n')
}

function tsFieldType(node: FieldNode, options: GeneratorOptions, allInterfaces: TSInterface[]): string {
  if (node.type === 'object' && node.children) {
    const nestedName = capitalize(node.name)
    const nested = generateTSInterfaceBody(node.children, { ...options, rootClassName: nestedName }, allInterfaces, 0)
    allInterfaces.push({ name: nestedName, code: nested })
    return nestedName
  }
  if (node.type === 'array') {
    if (node.arrayItemType === 'object' && node.children) {
      const nestedName = capitalize(node.name)
      const nested = generateTSInterfaceBody(node.children, { ...options, rootClassName: nestedName }, allInterfaces, 0)
      allInterfaces.push({ name: nestedName, code: nested })
      return `${nestedName}[]`
    }
    return `${tsPrimitiveType(node.arrayItemType || 'string')}[]`
  }
  return tsPrimitiveType(node.type)
}

function tsPrimitiveType(t: string): string {
  switch (t) {
    case 'string': return 'string'
    case 'integer': case 'float': return 'number'
    case 'boolean': return 'boolean'
    case 'null': return 'null'
    default: return 'any'
  }
}

// --- TOML Generator ---

function generateTOML(tree: FieldNode[]): string {
  const obj = treeToObject(tree) as Record<string, unknown>
  const lines: string[] = []
  writeTOMLTable(obj, lines)
  return lines.join('\n')
}

function writeTOMLTable(obj: Record<string, unknown>, lines: string[], prefix: string = '') {
  for (const [key, val] of Object.entries(obj)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>
      // 检查嵌套对象是否所有值都是简单类型（无更深嵌套）
      const hasNested = Object.values(nested).some(v =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
      )
      if (hasNested) {
        lines.push(`[${prefix}${key}]`)
        writeTOMLTable(nested, lines, `${prefix}${key}.`)
      } else {
        lines.push(`[${prefix}${key}]`)
        for (const [nk, nv] of Object.entries(nested)) {
          lines.push(`${nk} = ${tomlValue(nv)}`)
        }
      }
    } else if (Array.isArray(val)) {
      const arr = val as unknown[]
      if (arr.length > 0 && arr.every(v => v !== null && typeof v === 'object' && !Array.isArray(v))) {
        for (const item of arr) {
          lines.push(`[[${prefix}${key}]]`)
          for (const [ik, iv] of Object.entries(item as Record<string, unknown>)) {
            lines.push(`${ik} = ${tomlValue(iv)}`)
          }
        }
      } else {
        lines.push(`${key} = ${tomlValue(val)}`)
      }
    } else {
      lines.push(`${key} = ${tomlValue(val)}`)
    }
  }
}

function tomlValue(val: unknown): string {
  if (val === null || val === undefined) return '""'
  if (typeof val === 'string') {
    // 如果包含特殊字符，用双引号包起来
    if (/[#\[\]=\n"]/.test(val)) {
      return JSON.stringify(val)
    }
    return `"${val}"`
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) {
    const items = (val as unknown[]).map(tomlValue)
    return `[${items.join(', ')}]`
  }
  return `"${String(val)}"`
}
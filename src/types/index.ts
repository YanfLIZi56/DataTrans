export type FieldType = 'string' | 'integer' | 'float' | 'boolean' | 'object' | 'array' | 'null'

export interface FieldNode {
  id: string
  name: string
  type: FieldType
  value: unknown
  children?: FieldNode[]
  parentId?: string | null
  isArrayRoot?: boolean
  arrayItemType?: FieldType
  expanded?: boolean
  decimalPlaces?: number
}

export type InputFormat = 'JSON' | 'YAML' | 'CSV' | 'SQL(DDL)' | 'Java Object' | 'Python Object' | 'Go Object' | 'ES Mapping'
export type OutputFormat = 'JSON' | 'YAML' | 'SQL (建表)' | 'SQL (新增)' | 'SQL (查询)' | 'SQL (更新)' | 'Java POJO' | 'Python Dataclass' | 'Go Struct' | 'ES Mapping'
export type SQLDialect = 'MySQL' | 'PostgreSQL' | 'SQL Server'

export interface ToastMessage {
  id: string
  message: string
  type: 'warning' | 'success' | 'error'
}

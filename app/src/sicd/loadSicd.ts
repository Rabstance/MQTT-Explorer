import JSON5 from 'json5'
import {
  SICD_SECTIONS,
  SicdDocument,
  SicdEnum,
  SicdField,
  SicdFields,
  SicdLoadResult,
  SicdMessage,
  SicdSection,
  SicdSourceFile,
  SicdStruct,
} from './types'

const NUMERIC_TYPES = new Set(['U1', 'U2', 'U4', 'U8', 'I1', 'I2', 'I4', 'I8', 'F4', 'F8'])
const MESSAGE_META_KEYS = new Set(['Name', 'Retained', 'IsDatabaseMsg', 'Comment'])
const MAX_STRUCT_DEPTH = 32

interface Scope {
  enums: Map<string, SicdEnum>
  structs: Map<string, SicdStruct>
  constants: Map<string, number>
}

/**
 * Parses a set of SICD files (usually all *.json5 files of a folder) and derives the publishable messages.
 * Types are resolved per message file from the file itself and its (transitive) Includes.
 */
export function loadSicdFiles(sources: Array<SicdSourceFile>): SicdLoadResult {
  const warnings: Array<string> = []
  const documents = new Map<string, SicdDocument>()

  for (const source of sources) {
    try {
      documents.set(source.name, JSON5.parse(source.content))
    } catch (error) {
      warnings.push(`${source.name}: ${(error as Error).message}`)
    }
  }

  const messages: Array<SicdMessage> = []
  const topics = new Set<string>()

  for (const [file, document] of documents) {
    if (!document.Messages || document.Messages.length === 0) {
      continue
    }

    const element = document.Info?.Element?.trim()
    if (!element) {
      warnings.push(`${file}: defines messages but has no Info.Element, skipped`)
      continue
    }

    const scope = buildScope(file, documents, warnings)

    for (const definition of document.Messages) {
      for (const key of Object.keys(definition)) {
        if (MESSAGE_META_KEYS.has(key)) {
          continue
        }

        const section = SICD_SECTIONS.find(s => s === key) as SicdSection | undefined
        if (!section) {
          warnings.push(`${file}: ${definition.Name}: unknown section '${key}' ignored`)
          continue
        }

        const topic = `${element}/${section}/${definition.Name}`.toLowerCase()
        if (topics.has(topic)) {
          warnings.push(`${file}: duplicate topic '${topic}' ignored`)
          continue
        }
        topics.add(topic)

        const fields = (definition[key] ?? {}) as SicdFields
        const template = buildTemplate(fields, scope, `${file}: ${definition.Name}.${section}`, warnings, 0)

        messages.push({
          topic,
          element,
          section,
          name: definition.Name,
          payload: JSON.stringify(template, undefined, 2),
          retain: (definition.Retained ?? []).some(retained => retained.toLowerCase() === section.toLowerCase()),
          isDatabaseMsg: Boolean(definition.IsDatabaseMsg),
          file,
        })
      }
    }
  }

  return { messages, warnings: Array.from(new Set(warnings)) }
}

function buildScope(file: string, documents: Map<string, SicdDocument>, warnings: Array<string>): Scope {
  const scope: Scope = { enums: new Map(), structs: new Map(), constants: new Map() }
  const visited = new Set<string>()

  const visit = (name: string) => {
    if (visited.has(name)) {
      return
    }
    visited.add(name)

    const document = documents.get(name)!
    for (const include of document.Includes ?? []) {
      const resolved = resolveInclude(include, documents)
      if (resolved) {
        visit(resolved)
      } else {
        warnings.push(`${name}: include '${include}' was not found in the SICD folder or could not be parsed`)
      }
    }

    // Definitions of the including file take precedence over included ones
    addDefinitions(scope, document, name, warnings)
  }

  visit(file)

  return scope
}

function resolveInclude(include: string, documents: Map<string, SicdDocument>): string | undefined {
  const baseName = include.split(/[\\/]/).pop()?.toLowerCase()

  return Array.from(documents.keys()).find(name => name.toLowerCase() === baseName)
}

function addDefinitions(scope: Scope, document: SicdDocument, file: string, warnings: Array<string>) {
  const add = <T extends { Name: string }>(map: Map<string, T>, definition: T, kind: string) => {
    const existing = map.get(definition.Name)
    if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) {
      warnings.push(`${file}: ${kind} '${definition.Name}' redefines an included definition`)
    }
    map.set(definition.Name, definition)
  }

  document.Enums?.forEach(definition => add(scope.enums, definition, 'enum'))
  document.Structs?.forEach(definition => add(scope.structs, definition, 'struct'))
  document.Constants?.forEach(constant => {
    if (typeof constant.Value === 'number') {
      scope.constants.set(constant.Name, constant.Value)
    }
  })
}

function buildTemplate(
  fields: SicdFields,
  scope: Scope,
  context: string,
  warnings: Array<string>,
  depth: number
): { [fieldName: string]: unknown } {
  const template: { [fieldName: string]: unknown } = {}

  for (const [fieldName, field] of Object.entries(fields)) {
    const fieldContext = `${context}.${fieldName}`
    const value = templateValue(field, scope, fieldContext, warnings, depth)
    // Arrays are generated with a single element, it can be copied to add more
    template[fieldName] = isArray(field, scope) ? [value] : value
  }

  return template
}

function templateValue(
  field: SicdField,
  scope: Scope,
  context: string,
  warnings: Array<string>,
  depth: number
): unknown {
  const { Type: type, Default: defaultValue } = field

  if (type === 'CH') {
    return typeof defaultValue === 'string' ? defaultValue : ''
  }

  if (NUMERIC_TYPES.has(type)) {
    return typeof defaultValue === 'number' ? defaultValue : 0
  }

  const enumDefinition = scope.enums.get(type)
  if (enumDefinition) {
    const valueNames = Object.keys(enumDefinition.Enum ?? {})
    if (typeof defaultValue === 'string' && valueNames.includes(defaultValue)) {
      return defaultValue
    }
    if (defaultValue !== undefined) {
      warnings.push(`${context}: default '${defaultValue}' is not a value of ${type}`)
    }

    return valueNames[0] ?? null
  }

  const structDefinition = scope.structs.get(type)
  if (structDefinition) {
    if (depth >= MAX_STRUCT_DEPTH) {
      warnings.push(`${context}: structs are nested too deeply, is '${type}' recursive?`)
      return {}
    }

    return buildTemplate(structDefinition.Struct ?? {}, scope, context, warnings, depth + 1)
  }

  warnings.push(`${context}: unknown type '${type}'`)

  return null
}

function isArray(field: SicdField, scope: Scope): boolean {
  if (field.Type === 'CH' || field.MaxCount === undefined) {
    return false
  }

  const count = typeof field.MaxCount === 'number' ? field.MaxCount : scope.constants.get(field.MaxCount)

  // An unresolvable constant most likely describes an array
  return count === undefined || count > 1
}

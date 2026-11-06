import {
  BdCatalog,
  BdEnumDef,
  BdFieldDef,
  BdHeaderLayout,
  BdMessageDef,
  BdSourceFile,
  BdStructDef,
  FieldPosition,
} from './types'

export type XmlParser = (text: string) => Document

/** Size in bytes of the primitive types, CH and ST are one byte per character */
export const PRIMITIVE_SIZES: { [type: string]: number } = {
  U1: 1,
  U2: 2,
  U4: 4,
  U8: 8,
  I1: 1,
  I2: 2,
  I4: 4,
  I8: 8,
  F4: 4,
  F8: 8,
  CH: 1,
  ST: 1,
}

const MAX_DEPTH = 32
const BYTE_ORDER_MARK = 0xfeff
const MESSAGE_FILE_ROOT = /<(MessageFile|TypeFile)[\s>/]/

const defaultParser: XmlParser = text => new DOMParser().parseFromString(text, 'text/xml')

export function isPrimitive(type: string) {
  return type === 'BIT' || PRIMITIVE_SIZES[type] !== undefined
}

/**
 * Parses decimal, hexadecimal (0x…) and floating point numbers, undefined for anything else
 */
export function parseNumber(text: string | undefined): number | undefined {
  const trimmed = text?.trim()
  if (!trimmed) {
    return undefined
  }
  const negative = trimmed.startsWith('-')
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const value = Number(unsigned)
  if (Number.isNaN(value)) {
    return undefined
  }

  return negative ? -value : value
}

function childElements(element: Element, name?: string): Array<Element> {
  return Array.from(element.childNodes).filter(
    (node): node is Element => node.nodeType === 1 && (!name || (node as Element).nodeName === name)
  )
}

function attribute(element: Element, name: string): string | undefined {
  const value = element.getAttribute(name)
  return value === null ? undefined : value.trim()
}

/** Text of the Comment children, one line per comment line without the XML indentation */
function commentOf(element: Element): string | undefined {
  const lines = childElements(element, 'Comment')
    .flatMap(comment => (comment.textContent ?? '').split(/\r?\n/))
    .map(line => line.trim())
    .filter(line => line.length > 0)

  return lines.length > 0 ? lines.join('\n') : undefined
}

function parseField(element: Element): BdFieldDef {
  const count = parseNumber(attribute(element, 'Count'))
  return {
    name: attribute(element, 'Name') ?? '',
    type: attribute(element, 'Type') ?? '',
    count: count !== undefined && count >= 0 ? Math.floor(count) : 1,
    // "Defualt" is a misspelling found in some SICD files
    default: attribute(element, 'Default') ?? attribute(element, 'Defualt'),
    min: attribute(element, 'Min'),
    max: attribute(element, 'Max'),
    units: attribute(element, 'Units'),
    scalingFactor: attribute(element, 'ScalingFactor'),
    comment: commentOf(element),
  }
}

interface ParsedFile {
  name: string
  typedefs: Array<Element>
  messages: Array<Element>
}

function parseFile(
  source: BdSourceFile,
  parse: XmlParser,
  warnings: Array<string>
): ParsedFile | 'ignored' | undefined {
  const { content } = source
  // Other XML files, e.g. module interface configurations, are not parsed.
  // Their DTDs reference external entities, which Chromium reports as errors.
  if (!MESSAGE_FILE_ROOT.test(content)) {
    return 'ignored'
  }

  let doc: Document
  try {
    // A byte order mark in front of the XML declaration is not accepted by DOMParser
    doc = parse(content.charCodeAt(0) === BYTE_ORDER_MARK ? content.slice(1) : content)
  } catch (error) {
    warnings.push(`${source.name}: could not be parsed, ${(error as Error)?.message ?? error}`)
    return undefined
  }

  const parserError = doc.getElementsByTagName('parsererror')[0]
  if (parserError) {
    const reason = (parserError.textContent ?? '').trim().split(/\r?\n/)[0]
    warnings.push(`${source.name}: is not valid XML${reason ? `, ${reason}` : ''}`)
    return undefined
  }

  const root = doc.documentElement
  if (!root || (root.nodeName !== 'MessageFile' && root.nodeName !== 'TypeFile')) {
    return 'ignored'
  }

  return {
    name: source.name,
    typedefs: Array.from(root.getElementsByTagName('Typedef')),
    messages: Array.from(root.getElementsByTagName('Message')),
  }
}

/**
 * Loads the XML message definitions of a binary data (BD) SICD folder.
 * Typedefs are resolved in the file they are used in first, then in the other files.
 */
export function loadBdFiles(sources: Array<BdSourceFile>, parse: XmlParser = defaultParser): BdCatalog {
  const warnings: Array<string> = []
  const files: Array<ParsedFile> = []
  const ignoredFiles: Array<string> = []

  for (const source of sources) {
    const parsed = parseFile(source, parse, warnings)
    if (parsed === 'ignored') {
      ignoredFiles.push(source.name)
    } else if (parsed) {
      files.push(parsed)
    }
  }

  // Typedefs of every file, unresolved
  const enums = new Map<string, BdEnumDef>()
  const structs = new Map<string, BdStructDef>()
  const typedefIds = new Map<string, Map<string, string>>()
  const globalTypedefIds = new Map<string, string>()

  for (const file of files) {
    const ids = new Map<string, string>()
    typedefIds.set(file.name, ids)
    for (const typedef of file.typedefs) {
      const name = attribute(typedef, 'Name') ?? ''
      const id = `${file.name}:${name}`
      if (ids.has(name)) {
        warnings.push(`${file.name}: Typedef ${name} is defined more than once, the first definition is used`)
        continue
      }
      ids.set(name, id)
      if (!globalTypedefIds.has(name)) {
        globalTypedefIds.set(name, id)
      }

      const records = childElements(typedef, 'Record')
      const enumRecord = records.find(record => childElements(record, 'Enumeration').length > 0)
      if (enumRecord) {
        const base = attribute(enumRecord, 'Type') ?? ''
        const count = parseNumber(attribute(enumRecord, 'Count')) ?? 1
        const values = childElements(enumRecord, 'Enumeration').flatMap(enumeration => {
          const valueName = attribute(enumeration, 'Name') ?? ''
          const value = parseNumber(attribute(enumeration, 'Value'))
          if (value === undefined) {
            warnings.push(`${file.name}: ${name}.${valueName} has no numeric value`)
            return []
          }
          return [{ name: valueName, value, comment: commentOf(enumeration) }]
        })
        if (base !== 'BIT' && PRIMITIVE_SIZES[base] === undefined) {
          warnings.push(`${file.name}: enum ${name} has the unknown type '${base}'`)
        }
        enums.set(id, {
          id,
          name,
          file: file.name,
          base,
          bits: base === 'BIT' ? count : (PRIMITIVE_SIZES[base] ?? 0) * 8,
          values,
          comment: commentOf(typedef) ?? commentOf(enumRecord),
        })
      } else {
        structs.set(id, {
          id,
          name,
          file: file.name,
          fields: records.map(parseField),
          comment: commentOf(typedef),
        })
      }
    }
  }

  const resolve = (file: string, owner: string, field: BdFieldDef) => {
    if (isPrimitive(field.type)) {
      return
    }
    // Placeholders like U1??, the question marks are dropped
    const withoutQuestionMarks = field.type.replace(/\?+$/, '')
    if (withoutQuestionMarks !== field.type && isPrimitive(withoutQuestionMarks)) {
      warnings.push(
        `${file}: ${owner}.${field.name} has the type '${field.type}', it is decoded as ${withoutQuestionMarks}`
      )
      field.type = withoutQuestionMarks
      return
    }
    field.ref = typedefIds.get(file)?.get(field.type) ?? globalTypedefIds.get(field.type)
    if (!field.ref) {
      warnings.push(`${file}: ${owner}.${field.name} has the unknown type '${field.type}'`)
    }
  }

  structs.forEach(struct => struct.fields.forEach(field => resolve(struct.file, struct.name, field)))

  const sizer = new Sizer(enums, structs)
  structs.forEach(struct => {
    struct.size = sizer.structSize(struct.id)
  })
  const messages: Array<BdMessageDef> = []
  for (const file of files) {
    const fileStructs = Array.from(structs.values()).filter(struct => struct.file === file.name)
    const names = new Set<string>()
    for (const element of file.messages) {
      const name = attribute(element, 'Name') ?? ''
      if (names.has(name)) {
        warnings.push(`${file.name}: message ${name} is defined more than once, the first definition is used`)
        continue
      }
      names.add(name)

      const headerElement = childElements(element, 'Header')[0]
      const payloadElement = childElements(element, 'Payload')[0]
      const header = headerElement ? childElements(headerElement, 'Field').map(parseField) : []
      // Messages without Header and Payload list their fields directly
      const payloadFields = payloadElement ? childElements(payloadElement, 'Field') : childElements(element, 'Field')
      const payload = payloadFields.map(parseField)
      header.forEach(field => resolve(file.name, name, field))
      payload.forEach(field => resolve(file.name, name, field))

      const comment = commentOf(element)
      const recordCandidates = fileStructs
        .filter(struct => (struct.size ?? 0) > 0)
        // Structs mentioned in the comment of the message are the most likely records
        .sort((a, b) => Number(comment?.includes(b.name) ?? false) - Number(comment?.includes(a.name) ?? false))
        .map(struct => struct.id)

      messages.push({
        id: `${file.name}:${name}`,
        name,
        file: file.name,
        srcNode: attribute(element, 'SrcNode') ?? '',
        destNode: attribute(element, 'DestNode') ?? '',
        replyMsg: attribute(element, 'ReplyMsg'),
        isDatabaseMsg: /^yes$/i.test(attribute(element, 'IsDatabaseMsg') ?? ''),
        bigEndian: /^yes$/i.test(attribute(element, 'EndianSwap') ?? ''),
        comment,
        header,
        payload,
        headerSize: sizer.fieldsSize(header),
        payloadSize: sizer.fieldsSize(payload),
        headerId: headerIdOf(header),
        lengthField: positionOf(header, /^MsgLength$/i),
        recordCandidates,
      })
    }
  }

  const byName = new Map<string, Array<BdMessageDef>>()
  const byHeaderId = new Map<string, Array<BdMessageDef>>()
  for (const message of messages) {
    const nameKey = message.name.toLowerCase()
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), message])
    if (message.headerId) {
      const key = headerIdKey(message.headerId)
      byHeaderId.set(key, [...(byHeaderId.get(key) ?? []), message])
    }
  }

  warnings.push(...duplicateNameWarnings(byName))

  return {
    files: files.map(file => file.name),
    ignoredFiles,
    messages,
    enums,
    structs,
    byName,
    byHeaderId,
    headerLayouts: headerLayoutsOf(messages),
    warnings: Array.from(new Set(warnings)),
  }
}

export function headerIdKey(id: { moduleAddress: number; msgType: number; msgId: number }) {
  return `${id.moduleAddress}/${id.msgType}/${id.msgId}`
}

function headerIdOf(header: Array<BdFieldDef>) {
  const valueOf = (pattern: RegExp) => parseNumber(header.find(field => pattern.test(field.name))?.default)
  const moduleAddress = valueOf(/^ModuleAddress$/i)
  const msgType = valueOf(/^MsgType$/i)
  const msgId = valueOf(/^MsgId$/i)

  return moduleAddress !== undefined && msgType !== undefined && msgId !== undefined
    ? { moduleAddress, msgType, msgId }
    : undefined
}

/** Byte offset and size of a primitive header field, only fields after primitive fields have a fixed offset */
function positionOf(header: Array<BdFieldDef>, pattern: RegExp): FieldPosition | undefined {
  let offset = 0
  for (const field of header) {
    const size = PRIMITIVE_SIZES[field.type]
    if (size === undefined || field.type === 'CH' || field.type === 'ST') {
      return undefined
    }
    if (pattern.test(field.name)) {
      return field.count === 1 ? { offset, size } : undefined
    }
    offset += size * field.count
  }
  return undefined
}

/** The distinct header layouts, used to identify a message by its header when the topic does not match */
function headerLayoutsOf(messages: Array<BdMessageDef>): Array<BdHeaderLayout> {
  const layouts = new Map<string, BdHeaderLayout>()
  for (const message of messages) {
    const moduleAddress = positionOf(message.header, /^ModuleAddress$/i)
    const msgType = positionOf(message.header, /^MsgType$/i)
    const msgId = positionOf(message.header, /^MsgId$/i)
    if (!message.headerId || !message.lengthField || !moduleAddress || !msgType || !msgId || !message.headerSize) {
      continue
    }
    const layout = {
      bigEndian: message.bigEndian,
      headerSize: message.headerSize,
      lengthField: message.lengthField,
      moduleAddress,
      msgType,
      msgId,
    }
    layouts.set(JSON.stringify(layout), layout)
  }
  return Array.from(layouts.values())
}

/** One warning per pair of files defining the same message names, rather than one per message */
function duplicateNameWarnings(byName: Map<string, Array<BdMessageDef>>) {
  const pairs = new Map<string, Array<string>>()
  byName.forEach(definitions => {
    if (definitions.length < 2) {
      return
    }
    const key = definitions.map(definition => definition.file).join(' and ')
    pairs.set(key, [...(pairs.get(key) ?? []), definitions[0].name])
  })

  return Array.from(pairs, ([files, names]) => {
    const examples = names.slice(0, 3).join(', ') + (names.length > 3 ? ', …' : '')
    return (
      `${names.length} message name(s) are defined in ${files} (${examples}). ` +
      'A topic is decoded with the file whose module matches the topic, otherwise with the first file.'
    )
  })
}

/**
 * Computes sizes with the layout rules of the decoder:
 * BIT fields are packed into a bit stream, every other field starts at the next byte boundary.
 */
class Sizer {
  private structSizes = new Map<string, number | undefined>()

  constructor(
    private enums: Map<string, BdEnumDef>,
    private structs: Map<string, BdStructDef>
  ) {}

  public fieldsSize(fields: Array<BdFieldDef>): number | undefined {
    const bits = this.advance(fields, 0, 0)
    return bits === undefined ? undefined : Math.ceil(bits / 8)
  }

  public structSize(id: string): number | undefined {
    if (!this.structSizes.has(id)) {
      const struct = this.structs.get(id)
      this.structSizes.set(id, struct ? this.fieldsSize(struct.fields) : undefined)
    }
    return this.structSizes.get(id)
  }

  /** Bit position after the fields, undefined if a size is unknown */
  private advance(fields: Array<BdFieldDef>, position: number, depth: number): number | undefined {
    let bits: number | undefined = position
    for (const field of fields) {
      bits = this.advanceField(field, bits, depth)
      if (bits === undefined) {
        return undefined
      }
    }
    return bits
  }

  private advanceField(field: BdFieldDef, position: number, depth: number): number | undefined {
    if (field.type === 'BIT') {
      return position + field.count
    }
    const primitiveSize = PRIMITIVE_SIZES[field.type]
    if (primitiveSize !== undefined) {
      return alignToByte(position) + primitiveSize * 8 * field.count
    }
    const enumDef = field.ref ? this.enums.get(field.ref) : undefined
    if (enumDef) {
      if (!enumDef.bits) {
        return undefined
      }
      return (enumDef.base === 'BIT' ? position : alignToByte(position)) + enumDef.bits * field.count
    }
    const struct = field.ref ? this.structs.get(field.ref) : undefined
    if (!struct || depth > MAX_DEPTH) {
      return undefined
    }
    let bits: number | undefined = position
    for (let index = 0; index < field.count && bits !== undefined; index += 1) {
      bits = this.advance(struct.fields, bits, depth + 1)
    }
    return bits
  }
}

export function alignToByte(bits: number) {
  return Math.ceil(bits / 8) * 8
}

import { PRIMITIVE_SIZES, alignToByte, headerIdKey } from './loadBd'
import { BdCatalog, BdDecodeResult, BdEnumDef, BdFieldDef, BdMessageDef, FieldPosition } from './types'

const MAX_DEPTH = 32
/** Longer arrays are cut off, huge messages would otherwise freeze the UI */
const MAX_ARRAY_LENGTH = 4096
const MAX_RECORDS = 10000
const MAX_WARNINGS = 20
const MAX_TRAILING_BYTES_SHOWN = 256

/** Fields counting the records that follow the payload of a data message */
const COUNT_FIELD = /^(NumberOf|NumOf|Num[A-Z_]|Count)|Count$/

/** The message ended before all fields were read */
class EndOfData extends Error {}

/** Decoding can not continue, e.g. because the size of a type is unknown */
class DecodeStop extends Error {}

/**
 * Finds the message definition of a topic, the last topic level is the message name.
 * When several files define the name, the file whose module matches the level before it is used,
 * e.g. SYSTEM/MODULE/MessageName.
 */
export function findMessageForTopic(catalog: BdCatalog, topic: string): BdMessageDef | undefined {
  const levels = topic.split('/')
  const candidates = catalog.byName.get(levels[levels.length - 1].toLowerCase())
  if (!candidates || candidates.length < 2) {
    return candidates?.[0]
  }

  const module = (levels[levels.length - 2] ?? '').toLowerCase()
  return (
    (module &&
      candidates.find(
        definition =>
          definition.srcNode.toLowerCase() === module ||
          definition.destNode.toLowerCase() === module ||
          definition.file.toLowerCase().includes(module)
      )) ||
    candidates[0]
  )
}

function readUnsigned(bytes: Uint8Array, position: FieldPosition, littleEndian: boolean): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  switch (position.size) {
    case 1:
      return view.getUint8(position.offset)
    case 2:
      return view.getUint16(position.offset, littleEndian)
    case 4:
      return view.getUint32(position.offset, littleEndian)
    default:
      return Number(view.getBigUint64(position.offset, littleEndian))
  }
}

/**
 * Identifies a message by its header: MsgLength must match the size of the message,
 * ModuleAddress, MsgType and MsgId must match the defaults of a message definition.
 */
export function findMessageForData(catalog: BdCatalog, bytes: Uint8Array): BdMessageDef | undefined {
  for (const layout of catalog.headerLayouts) {
    if (bytes.length < layout.headerSize) {
      continue
    }
    const littleEndian = !layout.bigEndian
    const length = readUnsigned(bytes, layout.lengthField, littleEndian)
    if (length !== bytes.length - layout.lengthField.offset - layout.lengthField.size) {
      continue
    }
    const key = headerIdKey({
      moduleAddress: readUnsigned(bytes, layout.moduleAddress, littleEndian),
      msgType: readUnsigned(bytes, layout.msgType, littleEndian),
      msgId: readUnsigned(bytes, layout.msgId, littleEndian),
    })
    const match = catalog.byHeaderId
      .get(key)
      ?.find(definition => definition.bigEndian === layout.bigEndian && definition.headerSize === layout.headerSize)
    if (match) {
      return match
    }
  }
  return undefined
}

/**
 * Whether the bytes start with the message header. Publishers may send the payload only,
 * this is detected by MsgLength not matching the size of the message and the size matching the payload.
 */
function includesHeader(definition: BdMessageDef, bytes: Uint8Array) {
  const { lengthField, headerSize, payloadSize } = definition
  if (definition.header.length === 0 || !headerSize) {
    return false
  }
  if (lengthField && bytes.length >= lengthField.offset + lengthField.size) {
    const length = readUnsigned(bytes, lengthField, !definition.bigEndian)
    if (length === bytes.length - lengthField.offset - lengthField.size) {
      return true
    }
  }

  return !(payloadSize !== undefined && bytes.length === payloadSize)
}

function bigIntValue(value: bigint): number | string {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(value)
    : value.toString()
}

/** NaN and Infinity can not be represented in JSON, F4 values are rounded to their precision */
function floatValue(value: number, precision?: number): number | string {
  if (!Number.isFinite(value)) {
    return String(value)
  }
  return precision ? Number(value.toPrecision(precision)) : value
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}

/**
 * Reads the fields in order. BIT fields are read as a stream of bits, most significant bit first,
 * every other field starts at the next byte boundary.
 */
class Reader {
  /** Position in bits */
  private position = 0

  private view: DataView

  constructor(
    private bytes: Uint8Array,
    private littleEndian: boolean
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  /** Bytes after the current position */
  public get remaining() {
    return this.bytes.length - alignToByte(this.position) / 8
  }

  private take(size: number) {
    const offset = alignToByte(this.position) / 8
    if (offset + size > this.bytes.length) {
      throw new EndOfData()
    }
    this.position = (offset + size) * 8
    return offset
  }

  public skip(size: number) {
    this.take(size)
  }

  public primitive(type: string): number | string {
    const offset = this.take(PRIMITIVE_SIZES[type])
    const { view, littleEndian } = this
    switch (type) {
      case 'U1':
        return view.getUint8(offset)
      case 'U2':
        return view.getUint16(offset, littleEndian)
      case 'U4':
        return view.getUint32(offset, littleEndian)
      case 'U8':
        return bigIntValue(view.getBigUint64(offset, littleEndian))
      case 'I1':
        return view.getInt8(offset)
      case 'I2':
        return view.getInt16(offset, littleEndian)
      case 'I4':
        return view.getInt32(offset, littleEndian)
      case 'I8':
        return bigIntValue(view.getBigInt64(offset, littleEndian))
      case 'F4':
        return floatValue(view.getFloat32(offset, littleEndian), 7)
      case 'F8':
        return floatValue(view.getFloat64(offset, littleEndian))
      default:
        return view.getUint8(offset)
    }
  }

  /** Characters up to the first NUL, the remaining characters are padding */
  public string(length: number) {
    const offset = this.take(length)
    let text = ''
    for (let index = offset; index < offset + length && this.bytes[index] !== 0; index += 1) {
      text += String.fromCharCode(this.bytes[index])
    }
    return text
  }

  public bits(count: number) {
    if (this.position + count > this.bytes.length * 8) {
      throw new EndOfData()
    }
    let value = 0
    for (let index = 0; index < count; index += 1) {
      const bit = this.position + index
      // eslint-disable-next-line no-bitwise
      value = value * 2 + ((this.bytes[bit >> 3] >> (7 - (bit & 7))) & 1)
    }
    this.position += count
    return value
  }
}

type Target = { [key: string]: unknown } | Array<unknown>

function setValue(target: Target, key: string | number, value: unknown) {
  if (Array.isArray(target)) {
    target.push(value)
  } else {
    target[key] = value
  }
}

class FieldDecoder {
  public warnings: Array<string> = []

  private enumValues = new Map<string, Map<number, string>>()

  constructor(
    private catalog: BdCatalog,
    private reader: Reader
  ) {}

  /**
   * Values are added to the target before nested values are read,
   * a message ending early still shows everything read up to that point.
   */
  public fields(fields: Array<BdFieldDef>, target: { [key: string]: unknown }, path: string, depth: number) {
    for (const field of fields) {
      this.field(field, target, field.name, `${path}.${field.name}`, depth)
    }
  }

  private field(field: BdFieldDef, target: Target, key: string, path: string, depth: number) {
    const { reader } = this
    if (field.type === 'CH' || field.type === 'ST') {
      setValue(target, key, reader.string(field.count))
      return
    }
    if (field.type === 'BIT') {
      setValue(target, key, reader.bits(field.count))
      return
    }

    const primitive = PRIMITIVE_SIZES[field.type] !== undefined
    const enumDef = field.ref ? this.catalog.enums.get(field.ref) : undefined
    const struct = field.ref ? this.catalog.structs.get(field.ref) : undefined
    if (!primitive && !enumDef && !struct) {
      throw new DecodeStop(`${path}: unknown type '${field.type}', decoding stopped`)
    }
    if (struct && depth >= MAX_DEPTH) {
      throw new DecodeStop(`${path}: structs are nested too deep, decoding stopped`)
    }

    const readElement = (into: Target, elementKey: string | number, elementPath: string) => {
      if (struct) {
        const value = {}
        setValue(into, elementKey, value)
        this.fields(struct.fields, value, elementPath, depth + 1)
      } else if (enumDef) {
        setValue(into, elementKey, this.enumValue(enumDef, elementPath))
      } else {
        setValue(into, elementKey, reader.primitive(field.type))
      }
    }

    if (field.count === 1) {
      readElement(target, key, path)
      return
    }

    const values: Array<unknown> = []
    setValue(target, key, values)
    const length = Math.min(field.count, MAX_ARRAY_LENGTH)
    for (let index = 0; index < length; index += 1) {
      readElement(values, index, `${path}[${index}]`)
    }
    if (field.count > length) {
      const skipped = field.count - length
      let elementSize = struct?.size
      if (primitive) {
        elementSize = PRIMITIVE_SIZES[field.type]
      } else if (enumDef) {
        elementSize = enumDef.base === 'BIT' ? undefined : PRIMITIVE_SIZES[enumDef.base]
      }
      if (!elementSize) {
        throw new DecodeStop(`${path}: arrays longer than ${MAX_ARRAY_LENGTH} elements are not decoded`)
      }
      reader.skip(elementSize * skipped)
      values.push(`… ${skipped} more`)
    }
  }

  private enumValue(enumDef: BdEnumDef, path: string) {
    const raw = enumDef.base === 'BIT' ? this.reader.bits(enumDef.bits) : this.reader.primitive(enumDef.base)
    let values = this.enumValues.get(enumDef.id)
    if (!values) {
      values = new Map(enumDef.values.map(value => [value.value, value.name]))
      this.enumValues.set(enumDef.id, values)
    }
    const name = typeof raw === 'number' ? values.get(raw) : undefined
    if (name === undefined) {
      this.warnings.push(`${path}: ${raw} is not a value of ${enumDef.name}`)
      return raw
    }
    return name
  }
}

function countValues(payload: unknown): Array<number> {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  return Object.entries(payload as { [key: string]: unknown })
    .filter(([name, value]) => COUNT_FIELD.test(name) && typeof value === 'number' && Number.isInteger(value))
    .map(([, value]) => value as number)
}

/**
 * Data messages are followed by records, e.g. NumberOfRecords structs of the same file.
 * The record struct is the struct of the same file whose size times a count field of the payload
 * equals the remaining bytes. Without count field the struct mentioned in the message comment is preferred.
 */
function recordStructFor(catalog: BdCatalog, definition: BdMessageDef, remaining: number, payload: unknown) {
  const candidates = definition.recordCandidates
    .map(id => catalog.structs.get(id))
    .filter(struct => struct?.size && remaining % struct.size === 0)
  const counts = countValues(payload)
  if (counts.length > 0) {
    return candidates.find(struct => counts.some(count => count * struct!.size! === remaining))
  }
  return candidates[0]
}

/**
 * Decodes a binary message into an object with the sections Header, Payload and Records.
 * Header is only present if the message starts with it, Records only for data messages.
 */
export function decodeBdMessage(catalog: BdCatalog, definition: BdMessageDef, bytes: Uint8Array): BdDecodeResult {
  const reader = new Reader(bytes, !definition.bigEndian)
  const decoder = new FieldDecoder(catalog, reader)
  const value: { [key: string]: unknown } = {}
  const withHeader = includesHeader(definition, bytes)
  let recordStruct: string | undefined

  try {
    if (withHeader) {
      const header = {}
      value.Header = header
      decoder.fields(definition.header, header, 'Header', 0)
    }
    if (definition.payload.length > 0) {
      const payload = {}
      value.Payload = payload
      decoder.fields(definition.payload, payload, 'Payload', 0)
    }

    const { remaining } = reader
    if (remaining > 0) {
      const struct = recordStructFor(catalog, definition, remaining, value.Payload)
      if (struct?.size) {
        recordStruct = struct.name
        const count = remaining / struct.size
        const records: Array<unknown> = []
        value.Records = records
        for (let index = 0; index < Math.min(count, MAX_RECORDS); index += 1) {
          const record = {}
          records.push(record)
          decoder.fields(struct.fields, record, `Records[${index}]`, 0)
        }
        if (count > MAX_RECORDS) {
          decoder.warnings.push(`Only the first ${MAX_RECORDS} of ${count} records are shown`)
        }
      } else {
        const offset = bytes.length - remaining
        value.TrailingBytes = hex(bytes.subarray(offset, offset + MAX_TRAILING_BYTES_SHOWN))
        decoder.warnings.push(
          `${remaining} byte(s) follow the payload of ${definition.name} and do not match a struct of ${definition.file}`
        )
      }
    }
  } catch (error) {
    if (error instanceof EndOfData) {
      const expected = (withHeader ? (definition.headerSize ?? 0) : 0) + (definition.payloadSize ?? 0)
      decoder.warnings.push(
        `The message ended early, it has ${bytes.length} byte(s) and ${definition.name} needs ${expected}`
      )
    } else if (error instanceof DecodeStop) {
      decoder.warnings.push(error.message)
    } else {
      throw error
    }
  }

  const { lengthField } = definition
  if (withHeader && lengthField && bytes.length >= lengthField.offset + lengthField.size) {
    const declared = readUnsigned(bytes, lengthField, !definition.bigEndian)
    const actual = bytes.length - lengthField.offset - lengthField.size
    if (declared !== actual) {
      decoder.warnings.push(`MsgLength is ${declared} but ${actual} byte(s) follow it`)
    }
  }

  const { warnings } = decoder
  return {
    value,
    recordStruct,
    warnings:
      warnings.length > MAX_WARNINGS
        ? [...warnings.slice(0, MAX_WARNINGS), `… ${warnings.length - MAX_WARNINGS} more warning(s)`]
        : warnings,
  }
}

import { isPrimitive, parseNumber } from '../../../bd/loadBd'
import { BdCatalog, BdFieldDef, BdMessageDef } from '../../../bd/types'
import { SicdFieldInfo, SicdFieldKind } from '../../../sicd/types'
import { SicdDefinitions } from '../Sicd/tree'

/**
 * Converts the XML definitions to the shape shown by the SICD tab components
 */
export function fieldInfo(field: BdFieldDef, catalog: BdCatalog): SicdFieldInfo {
  let kind: SicdFieldKind = 'unknown'
  if (isPrimitive(field.type)) {
    kind = 'primitive'
  } else if (field.ref && catalog.enums.has(field.ref)) {
    kind = 'enum'
  } else if (field.ref && catalog.structs.has(field.ref)) {
    kind = 'struct'
  }

  const bits = field.type === 'BIT'
  return {
    name: field.name,
    type: bits ? `BIT:${field.count}` : field.type,
    kind,
    ref: field.ref,
    maxCount: bits || field.count === 1 ? undefined : field.count,
    min: parseNumber(field.min),
    max: parseNumber(field.max),
    default: field.default === undefined ? undefined : (parseNumber(field.default) ?? field.default),
    units: field.units,
    scalingFactor: field.scalingFactor,
    comment: field.comment,
  }
}

export function displayDefinitions(catalog: BdCatalog): SicdDefinitions {
  return {
    structs: new Map(
      Array.from(catalog.structs.values(), struct => [
        struct.id,
        {
          id: struct.id,
          name: struct.name,
          comment: struct.comment,
          fields: struct.fields.map(field => fieldInfo(field, catalog)),
          files: [struct.file],
          payload: '',
        },
      ])
    ),
    enums: new Map(
      Array.from(catalog.enums.values(), enumDef => [
        enumDef.id,
        {
          id: enumDef.id,
          name: enumDef.name,
          type: enumDef.base === 'BIT' ? `BIT:${enumDef.bits}` : enumDef.base,
          comment: enumDef.comment,
          values: enumDef.values.map(({ name, value }) => ({ name, value })),
          files: [enumDef.file],
        },
      ])
    ),
  }
}

export interface FileGroup {
  file: string
  messages: Array<BdMessageDef>
}

function matches(message: BdMessageDef, filter: string) {
  return (
    message.name.toLowerCase().includes(filter) ||
    message.header.some(field => field.name.toLowerCase().includes(filter)) ||
    message.payload.some(field => field.name.toLowerCase().includes(filter))
  )
}

/**
 * Messages grouped by file, files whose name matches the filter show all their messages
 */
export function groupByFile(catalog: BdCatalog, filter: string): Array<FileGroup> {
  return catalog.files
    .map(file => {
      const fileMatches = file.toLowerCase().includes(filter)
      return {
        file,
        messages: catalog.messages.filter(
          message => message.file === file && (!filter || fileMatches || matches(message, filter))
        ),
      }
    })
    .filter(group => group.messages.length > 0)
}

function hex(value: number) {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`
}

export function messageSummary(message: BdMessageDef) {
  const parts = [`${message.srcNode} → ${message.destNode}`]
  if (message.headerId) {
    parts.push(`ID ${hex(message.headerId.msgId)}`)
  }
  const size =
    message.headerSize !== undefined && message.payloadSize !== undefined
      ? `${message.headerSize + message.payloadSize} bytes`
      : 'size unknown'
  parts.push(size)
  return parts.join(' · ')
}

import { SicdEnumInfo, SicdFieldInfo, SicdStructInfo } from '../sicd/types'

/**
 * A file of the binary data (BD) SICD folder, XML message definitions
 */
export interface BdSourceFile {
  name: string
  content: string
}

/**
 * A field of a message header, payload or struct as written in the XML definition
 */
export interface BdFieldDef {
  name: string
  /** Type as written, a primitive (U1 … F8, CH, ST, BIT) or the name of a Typedef */
  type: string
  /** Number of elements, characters for CH and ST, bits for BIT */
  count: number
  /** Id of the enum or struct Typedef the type refers to */
  ref?: string
  default?: string
  min?: string
  max?: string
  units?: string
  scalingFactor?: string
  comment?: string
}

export interface BdEnumDef {
  /** <file>:<name>, Typedef names are only unique within a file */
  id: string
  name: string
  file: string
  /** Underlying type of the values, a primitive or BIT */
  base: string
  /** Number of bits when the base type is BIT */
  bits: number
  values: Array<{ name: string; value: number; comment?: string }>
  comment?: string
}

export interface BdStructDef {
  /** <file>:<name>, Typedef names are only unique within a file */
  id: string
  name: string
  file: string
  fields: Array<BdFieldDef>
  /** Size in bytes, undefined if a field has an unknown type */
  size?: number
  comment?: string
}

/**
 * Identifies a message by the values of its header fields
 */
export interface BdHeaderId {
  moduleAddress: number
  msgType: number
  msgId: number
}

/** Byte offset and size of a header field */
export interface FieldPosition {
  offset: number
  size: number
}

/**
 * Positions of the header fields identifying a message, shared by the messages with the same header layout
 */
export interface BdHeaderLayout {
  bigEndian: boolean
  headerSize: number
  lengthField: FieldPosition
  moduleAddress: FieldPosition
  msgType: FieldPosition
  msgId: FieldPosition
}

export interface BdMessageDef {
  /** <file>:<name> */
  id: string
  name: string
  file: string
  srcNode: string
  destNode: string
  replyMsg?: string
  isDatabaseMsg: boolean
  /** EndianSwap="Yes", the message is big endian */
  bigEndian: boolean
  comment?: string
  header: Array<BdFieldDef>
  payload: Array<BdFieldDef>
  /** Size in bytes, undefined if a field has an unknown type */
  headerSize?: number
  payloadSize?: number
  headerId?: BdHeaderId
  /** The MsgLength header field, its value is the number of bytes following it */
  lengthField?: FieldPosition
  /** Ids of the structs of the same file that can follow the payload as records (data messages) */
  recordCandidates: Array<string>
}

export interface BdCatalog {
  /** XML message files that were loaded */
  files: Array<string>
  /** XML files that are not message files, e.g. module interface configurations */
  ignoredFiles: Array<string>
  messages: Array<BdMessageDef>
  enums: Map<string, BdEnumDef>
  structs: Map<string, BdStructDef>
  /** Lower case message name → definitions */
  byName: Map<string, Array<BdMessageDef>>
  /** <moduleAddress>/<msgType>/<msgId> → definitions */
  byHeaderId: Map<string, Array<BdMessageDef>>
  headerLayouts: Array<BdHeaderLayout>
  warnings: Array<string>
}

/**
 * Definitions shown in the BD tab, in the shape of the SICD tab components
 */
export interface BdDisplayDefinitions {
  structs: Map<string, SicdStructInfo>
  enums: Map<string, SicdEnumInfo>
  headerFields: Map<string, Array<SicdFieldInfo>>
  payloadFields: Map<string, Array<SicdFieldInfo>>
}

export interface BdDecodeResult {
  value: { [key: string]: unknown }
  /** Name of the struct decoded from the bytes following the payload */
  recordStruct?: string
  warnings: Array<string>
}

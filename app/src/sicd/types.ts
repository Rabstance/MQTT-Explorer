/**
 * Shape of a SICD (JSON5) definition file as written on disk.
 * Only the properties used by MQTT Explorer are described here.
 */
export interface SicdField {
  Type: string
  MaxCount?: number | string
  Default?: unknown
  Min?: number
  Max?: number
  Comment?: string
  UseStruct?: boolean
}

export type SicdFields = { [fieldName: string]: SicdField }

export interface SicdEnum {
  Name: string
  Type?: string
  Comment?: string
  Enum: { [valueName: string]: number }
}

export interface SicdStruct {
  Name: string
  Comment?: string
  Struct: SicdFields
}

export interface SicdConstant {
  Name: string
  Value?: unknown
}

export interface SicdMessageDefinition {
  Name: string
  Retained?: Array<string>
  IsDatabaseMsg?: boolean
  [section: string]: unknown
}

export interface SicdDocument {
  Info?: {
    Element?: string
    DefId?: string
    Version?: string
    Author?: string
    Description?: string
  }
  Includes?: Array<string>
  Constants?: Array<SicdConstant>
  Enums?: Array<SicdEnum>
  Structs?: Array<SicdStruct>
  Messages?: Array<SicdMessageDefinition>
}

export interface SicdSourceFile {
  name: string
  content: string
}

/**
 * Message sections that become their own topic. Cmd and CmdRsp of the same message are two separate messages.
 */
export const SICD_SECTIONS = ['Cmd', 'CmdRsp', 'Status', 'State', 'Data'] as const
export type SicdSection = (typeof SICD_SECTIONS)[number]

/**
 * A publishable message derived from a SICD message definition
 */
export interface SicdMessage {
  /** <element>/<section>/<name>, lower case */
  topic: string
  element: string
  section: SicdSection
  name: string
  /** JSON template filled with default values */
  payload: string
  retain: boolean
  isDatabaseMsg: boolean
  /** File the message is defined in */
  file: string
}

export type SicdFieldKind = 'primitive' | 'enum' | 'struct' | 'unknown'

/**
 * A field of a struct with its type resolved in the scope of the defining file
 */
export interface SicdFieldInfo {
  name: string
  type: string
  kind: SicdFieldKind
  /** Id of the enum or struct the type refers to */
  ref?: string
  maxCount?: number | string
  min?: number
  max?: number
  default?: unknown
  units?: string
  scalingFactor?: string
  comment?: string
}

export interface SicdEnumInfo {
  /** The name, unless differing definitions share it, then the name and file */
  id: string
  name: string
  /** Underlying type such as U1 or U4, not set for plain enums */
  type?: string
  comment?: string
  values: Array<{ name: string; value: number }>
  /** Identical definitions in several files are listed once */
  files: Array<string>
}

export interface SicdStructInfo {
  /** The name, unless differing definitions share it, then the name and file */
  id: string
  name: string
  comment?: string
  fields: Array<SicdFieldInfo>
  /** Identical definitions in several files are listed once */
  files: Array<string>
  /** JSON template filled with default values */
  payload: string
}

export interface SicdLoadResult {
  messages: Array<SicdMessage>
  enums: Array<SicdEnumInfo>
  structs: Array<SicdStructInfo>
  warnings: Array<string>
}

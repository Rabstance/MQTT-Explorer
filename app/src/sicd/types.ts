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

export interface SicdLoadResult {
  messages: Array<SicdMessage>
  warnings: Array<string>
}

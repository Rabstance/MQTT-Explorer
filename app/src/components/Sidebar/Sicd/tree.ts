import { SicdEnumInfo, SicdStructInfo } from '../../../sicd/types'

/**
 * Expansion state of the SICD tree nodes
 */
export interface Expansion {
  /**
   * @param followsFilter the node is expanded while a filter is active
   */
  isOpen(key: string, defaultOpen: boolean, followsFilter?: boolean): boolean
  toggle(key: string): void
}

export interface SicdDefinitions {
  structs: Map<string, SicdStructInfo>
  enums: Map<string, SicdEnumInfo>
}

// Styles of MUI components are set with `sx`, withStyles classes lose against the MUI defaults

// Children are indented below the expand icon of their parent with a vertical guide line in its center
export const indentGuideSx = {
  ml: '13px',
  borderLeft: 1,
  borderColor: 'divider',
}

export const chipSx = {
  height: '20px',
  fontSize: '0.7rem',
  ml: 0.5,
}

export const monospaceSx = {
  fontFamily: 'monospace',
}

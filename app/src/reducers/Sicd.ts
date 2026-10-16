import { createReducer } from './lib'
import { SicdMessage } from '../sicd/types'

export interface SicdState {
  folderPath?: string
  files: Array<string>
  messages: Array<SicdMessage>
  warnings: Array<string>
  loading: boolean
  /** The persisted folder has been restored, happens once per session */
  restored: boolean
}

export type Action = SetLoading | DidLoad | DidRestore

export enum ActionTypes {
  SICD_SET_LOADING = 'SICD_SET_LOADING',
  SICD_DID_LOAD = 'SICD_DID_LOAD',
  SICD_DID_RESTORE = 'SICD_DID_RESTORE',
}

export interface SetLoading {
  type: ActionTypes.SICD_SET_LOADING
  loading: boolean
}

export interface DidLoad {
  type: ActionTypes.SICD_DID_LOAD
  folderPath?: string
  files: Array<string>
  messages: Array<SicdMessage>
  warnings: Array<string>
}

export interface DidRestore {
  type: ActionTypes.SICD_DID_RESTORE
}

const initialState: SicdState = {
  files: [],
  messages: [],
  warnings: [],
  loading: false,
  restored: false,
}

export const sicdReducer = createReducer(initialState, {
  SICD_SET_LOADING: setLoading,
  SICD_DID_LOAD: didLoad,
  SICD_DID_RESTORE: didRestore,
})

function setLoading(state: SicdState, action: SetLoading): SicdState {
  return {
    ...state,
    loading: action.loading,
  }
}

function didLoad(state: SicdState, action: DidLoad): SicdState {
  return {
    ...state,
    folderPath: action.folderPath,
    files: action.files,
    messages: action.messages,
    warnings: action.warnings,
    loading: false,
  }
}

function didRestore(state: SicdState): SicdState {
  return {
    ...state,
    restored: true,
  }
}

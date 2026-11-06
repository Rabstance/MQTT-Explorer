import { createReducer } from './lib'
import { BdCatalog } from '../bd/types'

export interface BdState {
  folderPath?: string
  catalog?: BdCatalog
  /** Binary messages are decoded automatically */
  enabled: boolean
  loading: boolean
  /** The persisted folder has been restored, happens once per session */
  restored: boolean
}

export type Action = SetLoading | DidLoad | SetEnabled | DidRestore

export enum ActionTypes {
  BD_SET_LOADING = 'BD_SET_LOADING',
  BD_DID_LOAD = 'BD_DID_LOAD',
  BD_SET_ENABLED = 'BD_SET_ENABLED',
  BD_DID_RESTORE = 'BD_DID_RESTORE',
}

export interface SetLoading {
  type: ActionTypes.BD_SET_LOADING
  loading: boolean
}

export interface DidLoad {
  type: ActionTypes.BD_DID_LOAD
  folderPath?: string
  catalog: BdCatalog
}

export interface SetEnabled {
  type: ActionTypes.BD_SET_ENABLED
  enabled: boolean
}

export interface DidRestore {
  type: ActionTypes.BD_DID_RESTORE
}

const initialState: BdState = {
  enabled: false,
  loading: false,
  restored: false,
}

export const bdReducer = createReducer(initialState, {
  BD_SET_LOADING: setLoading,
  BD_DID_LOAD: didLoad,
  BD_SET_ENABLED: setEnabled,
  BD_DID_RESTORE: didRestore,
})

function setLoading(state: BdState, action: SetLoading): BdState {
  return {
    ...state,
    loading: action.loading,
  }
}

function didLoad(state: BdState, action: DidLoad): BdState {
  return {
    ...state,
    folderPath: action.folderPath,
    catalog: action.catalog,
    loading: false,
  }
}

function setEnabled(state: BdState, action: SetEnabled): BdState {
  return {
    ...state,
    enabled: action.enabled,
  }
}

function didRestore(state: BdState): BdState {
  return {
    ...state,
    restored: true,
  }
}

import { Dispatch } from 'redux'
import { makeOpenDialogRpc } from '../../../events/OpenDialogRequest'
import { ActionTypes } from '../reducers/Bd'
import { AppState } from '../reducers'
import { RpcEvents, rendererRpc } from '../eventBus'
import persistentStorage, { StorageIdentifier } from '../utils/PersistentStorage'
import { isBrowserMode } from '../utils/browserMode'
import { loadBdFiles } from '../bd/loadBd'
import { BdSourceFile } from '../bd/types'
import { configureBdDecoder } from '../decoders/BdDecoder'
import { showError } from './Global'

interface StoredBd {
  folderPath?: string
  /** Browser mode can not re-read a folder, the file contents are stored instead */
  files?: Array<BdSourceFile>
  enabled?: boolean
}

const bdIdentifier: StorageIdentifier<StoredBd> = {
  id: 'Bd',
}

function errorMessage(error: unknown) {
  return (error as Error)?.message ?? String(error)
}

/** Hands the loaded definitions and the switch state to the decoder */
function updateDecoder(getState: () => AppState) {
  const { catalog, enabled } = getState().bd
  configureBdDecoder(catalog, enabled)
}

async function store(getState: () => AppState, changes: StoredBd) {
  const stored = (await persistentStorage.load(bdIdentifier)) ?? {}
  await persistentStorage.store(bdIdentifier, { ...stored, ...changes, enabled: getState().bd.enabled })
}

const didLoadSources =
  (sources: Array<BdSourceFile>, folderPath?: string) => (dispatch: Dispatch<any>, getState: () => AppState) => {
    dispatch({ type: ActionTypes.BD_DID_LOAD, folderPath, catalog: loadBdFiles(sources) })
    updateDecoder(getState)
  }

export const restoreBd = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  if (getState().bd.restored) {
    return
  }
  dispatch({ type: ActionTypes.BD_DID_RESTORE })

  try {
    const stored = await persistentStorage.load(bdIdentifier)
    dispatch({ type: ActionTypes.BD_SET_ENABLED, enabled: stored?.enabled ?? false })
    if (stored?.files && stored.files.length > 0) {
      dispatch(didLoadSources(stored.files, stored.folderPath))
    } else if (stored?.folderPath && !isBrowserMode) {
      await dispatch(loadBdFolder(stored.folderPath, false))
    }
  } catch (error) {
    dispatch(showError(`Could not restore BD SICD folder: ${errorMessage(error)}`))
  }
}

export const chooseBdFolder = () => async (dispatch: Dispatch<any>) => {
  try {
    const { canceled, filePaths } = await rendererRpc.call(makeOpenDialogRpc(), {
      properties: ['openDirectory'],
      title: 'Select BD SICD folder (XML message files)',
    })

    if (!canceled && filePaths[0]) {
      await dispatch(loadBdFolder(filePaths[0]))
    }
  } catch (error) {
    dispatch(showError(errorMessage(error)))
  }
}

export const loadBdFolder =
  (folderPath: string, persist: boolean = true) =>
  async (dispatch: Dispatch<any>, getState: () => AppState) => {
    dispatch({ type: ActionTypes.BD_SET_LOADING, loading: true })
    try {
      const sources = await rendererRpc.call(RpcEvents.readSicdFolder, { folderPath, extensions: ['.xml'] })
      dispatch(didLoadSources(sources, folderPath))
      if (persist) {
        await store(getState, { folderPath, files: undefined })
      }
    } catch (error) {
      dispatch({ type: ActionTypes.BD_SET_LOADING, loading: false })
      dispatch(showError(`Could not read BD SICD folder ${folderPath}: ${errorMessage(error)}`))
    }
  }

export const reloadBdFolder = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  const { folderPath } = getState().bd
  if (folderPath) {
    await dispatch(loadBdFolder(folderPath, false))
  }
}

/**
 * Browser mode: the folder is selected with a directory file input and read client side.
 * Only files directly in the folder are used, like in the desktop app.
 */
export const loadBdBrowserFiles = (fileList: FileList) => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  const files = Array.from(fileList).filter(
    file => /\.xml$/i.test(file.name) && ((file as any).webkitRelativePath ?? '').split('/').length <= 2
  )
  const folderPath = (fileList[0] as any)?.webkitRelativePath?.split('/')[0] || undefined

  try {
    const sources = await Promise.all(files.map(async file => ({ name: file.name, content: await file.text() })))
    sources.sort((a, b) => a.name.localeCompare(b.name))
    dispatch(didLoadSources(sources, folderPath))
    await store(getState, { folderPath, files: sources })
  } catch (error) {
    dispatch(showError(`Could not read BD SICD files: ${errorMessage(error)}`))
  }
}

/**
 * Switches automatic decoding of binary messages on or off
 */
export const setBdDecoding = (enabled: boolean) => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  dispatch({ type: ActionTypes.BD_SET_ENABLED, enabled })
  updateDecoder(getState)
  try {
    await store(getState, {})
  } catch (error) {
    dispatch(showError(`Could not save the BD setting: ${errorMessage(error)}`))
  }
}

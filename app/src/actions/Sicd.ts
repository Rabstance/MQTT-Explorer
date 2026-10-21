import { Dispatch } from 'redux'
import { makeOpenDialogRpc } from '../../../events/OpenDialogRequest'
import { Action, ActionTypes } from '../reducers/Sicd'
import { AppState } from '../reducers'
import { RpcEvents, rendererRpc } from '../eventBus'
import persistentStorage, { StorageIdentifier } from '../utils/PersistentStorage'
import { isBrowserMode } from '../utils/browserMode'
import { loadSicdFiles } from '../sicd/loadSicd'
import { SicdMessage, SicdSourceFile, SicdStructInfo } from '../sicd/types'
import { setEditorMode, setPayload, setRetain, setTopic } from './Publish'
import { showError } from './Global'

interface StoredSicd {
  folderPath?: string
  /** Browser mode can not re-read a folder, the file contents are stored instead */
  files?: Array<SicdSourceFile>
}

const sicdIdentifier: StorageIdentifier<StoredSicd> = {
  id: 'Sicd',
}

function didLoadSources(sources: Array<SicdSourceFile>, folderPath?: string): Action {
  const { messages, enums, structs, warnings } = loadSicdFiles(sources)

  return {
    type: ActionTypes.SICD_DID_LOAD,
    folderPath,
    files: sources.map(source => source.name),
    messages,
    enums,
    structs,
    warnings,
  }
}

function errorMessage(error: unknown) {
  return (error as Error)?.message ?? String(error)
}

export const restoreSicd = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  if (getState().sicd.restored) {
    return
  }
  dispatch({ type: ActionTypes.SICD_DID_RESTORE })

  try {
    const stored = await persistentStorage.load(sicdIdentifier)
    if (stored?.files && stored.files.length > 0) {
      dispatch(didLoadSources(stored.files, stored.folderPath))
    } else if (stored?.folderPath && !isBrowserMode) {
      await dispatch(loadSicdFolder(stored.folderPath, false))
    }
  } catch (error) {
    dispatch(showError(`Could not restore SICD folder: ${errorMessage(error)}`))
  }
}

export const chooseSicdFolder = () => async (dispatch: Dispatch<any>) => {
  try {
    const { canceled, filePaths } = await rendererRpc.call(makeOpenDialogRpc(), {
      properties: ['openDirectory'],
      title: 'Select SICD folder',
    })

    if (!canceled && filePaths[0]) {
      await dispatch(loadSicdFolder(filePaths[0]))
    }
  } catch (error) {
    dispatch(showError(errorMessage(error)))
  }
}

export const loadSicdFolder =
  (folderPath: string, persist: boolean = true) =>
  async (dispatch: Dispatch<any>) => {
    dispatch({ type: ActionTypes.SICD_SET_LOADING, loading: true })
    try {
      const sources = await rendererRpc.call(RpcEvents.readSicdFolder, { folderPath })
      dispatch(didLoadSources(sources, folderPath))
      if (persist) {
        await persistentStorage.store(sicdIdentifier, { folderPath })
      }
    } catch (error) {
      dispatch({ type: ActionTypes.SICD_SET_LOADING, loading: false })
      dispatch(showError(`Could not read SICD folder ${folderPath}: ${errorMessage(error)}`))
    }
  }

export const reloadSicdFolder = () => async (dispatch: Dispatch<any>, getState: () => AppState) => {
  const { folderPath } = getState().sicd
  if (folderPath) {
    await dispatch(loadSicdFolder(folderPath, false))
  }
}

/**
 * Browser mode: the folder is selected with a directory file input and read client side
 */
export const loadSicdBrowserFiles = (fileList: FileList) => async (dispatch: Dispatch<any>) => {
  const files = Array.from(fileList).filter(file => /\.json5$/i.test(file.name))
  const folderPath = (fileList[0] as any)?.webkitRelativePath?.split('/')[0] || undefined

  try {
    const sources = await Promise.all(files.map(async file => ({ name: file.name, content: await file.text() })))
    sources.sort((a, b) => a.name.localeCompare(b.name))
    dispatch(didLoadSources(sources, folderPath))
    await persistentStorage.store(sicdIdentifier, { folderPath, files: sources })
  } catch (error) {
    dispatch(showError(`Could not read SICD files: ${errorMessage(error)}`))
  }
}

/**
 * Populates the publish section with the topic, payload template and retain flag of a SICD message
 */
export const selectSicdMessage = (message: SicdMessage) => (dispatch: Dispatch<any>) => {
  dispatch(setTopic(message.topic))
  dispatch(setEditorMode('json'))
  dispatch(setPayload(message.payload))
  dispatch(setRetain(message.retain))
}

/**
 * Populates the publish payload with the template of a struct, structs have no topic so it is kept as it is
 */
export const loadSicdStruct = (struct: SicdStructInfo) => (dispatch: Dispatch<any>) => {
  dispatch(setEditorMode('json'))
  dispatch(setPayload(struct.payload))
}

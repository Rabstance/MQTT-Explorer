import { combineReducers } from 'redux'
import { chartsReducer, ChartsState } from './Charts'
import { connectionManagerReducer, ConnectionManagerState } from './ConnectionManager'
import { connectionReducer, ConnectionState } from './Connection'
import { GlobalState, globalState } from './Global'
import { publishReducer, PublishState } from './Publish'
import { settingsReducer, SettingsState } from './Settings'
import { sicdReducer, SicdState } from './Sicd'
import { sidebarReducer, SidebarState } from './Sidebar'
import { treeReducer, TreeState } from './Tree'

export interface AppState {
  globalState: GlobalState
  tree: TreeState
  settings: SettingsState
  publish: PublishState
  sicd: SicdState
  charts: ChartsState
  sidebar: SidebarState
  connection: ConnectionState
  connectionManager: ConnectionManagerState
}

export default combineReducers({
  globalState,
  charts: chartsReducer,
  publish: publishReducer,
  sicd: sicdReducer,
  sidebar: sidebarReducer,
  connection: connectionReducer,
  settings: settingsReducer,
  tree: treeReducer,
  connectionManager: connectionManagerReducer,
})

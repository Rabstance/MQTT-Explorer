import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Collapse,
  IconButton,
  InputAdornment,
  LinearProgress,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Theme } from '@mui/material/styles'
import { withStyles } from '@mui/styles'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import FolderOpen from '@mui/icons-material/FolderOpen'
import Refresh from '@mui/icons-material/Refresh'
import Search from '@mui/icons-material/Search'
import { AppState } from '../../reducers'
import { SicdState } from '../../reducers/Sicd'
import { sicdActions } from '../../actions'
import { isBrowserMode } from '../../utils/browserMode'
import { SicdEnumInfo, SicdMessage, SicdStructInfo } from '../../sicd/types'
import { EnumList } from './Sicd/EnumList'
import { MessageTree, groupMessages } from './Sicd/MessageTree'
import { StructList } from './Sicd/StructList'
import { TreeBranch } from './Sicd/TreeBranch'
import { Expansion, SicdDefinitions, indentGuideSx } from './Sicd/tree'

interface Props {
  sicd: SicdState
  actions: typeof sicdActions
  classes: any
  /** Called after a message or struct has been loaded into the publish section */
  onLoadedIntoPublish?: () => void
}

const groupLabelSx = {
  fontSize: '0.75rem',
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'text.secondary',
}

function byName<T extends { id: string }>(a: T, b: T) {
  return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })
}

// Structs match by their name or a field name, enums by their name or a value name
function matchingStructs(structs: Array<SicdStructInfo>, filter: string) {
  return structs
    .filter(
      s => !filter || s.id.toLowerCase().includes(filter) || s.fields.some(f => f.name.toLowerCase().includes(filter))
    )
    .sort(byName)
}

function matchingEnums(enums: Array<SicdEnumInfo>, filter: string) {
  return enums
    .filter(
      e => !filter || e.id.toLowerCase().includes(filter) || e.values.some(v => v.name.toLowerCase().includes(filter))
    )
    .sort(byName)
}

function SicdTab(props: Props) {
  const { classes, actions, sicd, onLoadedIntoPublish } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>()
  const [warningsVisible, setWarningsVisible] = useState(false)

  useEffect(() => {
    actions.restoreSicd()
  }, [])

  const filterText = filter.trim().toLowerCase()
  const messageGroups = useMemo(() => groupMessages(sicd.messages, filterText), [sicd.messages, filterText])
  const structs = useMemo(() => matchingStructs(sicd.structs, filterText), [sicd.structs, filterText])
  const enums = useMemo(() => matchingEnums(sicd.enums, filterText), [sicd.enums, filterText])
  const definitions: SicdDefinitions = useMemo(
    () => ({
      structs: new Map(sicd.structs.map(s => [s.id, s])),
      enums: new Map(sicd.enums.map(e => [e.id, e])),
    }),
    [sicd.structs, sicd.enums]
  )

  const toggle = useCallback((key: string) => {
    setToggled(previous => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const expansion: Expansion = useMemo(
    () => ({
      isOpen: (key, defaultOpen, followsFilter = true) =>
        (followsFilter && Boolean(filterText)) || (toggled.has(key) ? !defaultOpen : defaultOpen),
      toggle,
    }),
    [toggled, filterText, toggle]
  )

  const chooseFolder = useCallback(() => {
    if (isBrowserMode) {
      fileInputRef.current?.click()
    } else {
      actions.chooseSicdFolder()
    }
  }, [actions])

  const handleBrowserFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        actions.loadSicdBrowserFiles(event.target.files)
      }
      // Allow selecting the same folder again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [actions]
  )

  const selectMessage = useCallback(
    (message: SicdMessage) => {
      actions.selectSicdMessage(message)
      setSelectedTopic(message.topic)
      onLoadedIntoPublish?.()
    },
    [actions, onLoadedIntoPublish]
  )

  const loadStruct = useCallback(
    (struct: SicdStructInfo) => {
      actions.loadSicdStruct(struct)
      onLoadedIntoPublish?.()
    },
    [actions, onLoadedIntoPublish]
  )

  const messageCount = messageGroups.reduce(
    (sum, group) => sum + group.sections.reduce((sectionSum, section) => sectionSum + section.messages.length, 0),
    0
  )

  // Messages, structs and enums are top level groups, groups without a match are hidden while filtering
  const renderGroup = (
    name: string,
    label: string,
    count: number,
    defaultOpen: boolean,
    content: () => React.ReactNode
  ) => {
    if (count === 0) {
      return null
    }
    const key = `group:${name}`
    const open = expansion.isOpen(key, defaultOpen)

    return (
      <Box key={name} id={`sicd-group-${name}`} sx={{ borderTop: 1, borderColor: 'divider' }}>
        <TreeBranch nodeKey={key} label={label} count={count} open={open} onToggle={toggle} labelSx={groupLabelSx} />
        <Collapse in={open} unmountOnExit>
          <Box sx={indentGuideSx}>{content()}</Box>
        </Collapse>
      </Box>
    )
  }

  const renderEmptyState = () => {
    let text: string | undefined
    if (sicd.loading) {
      text = undefined
    } else if (sicd.files.length === 0 && !sicd.folderPath) {
      text = 'Choose the folder containing your SICD *.json5 files.'
    } else if (sicd.messages.length + sicd.structs.length + sicd.enums.length === 0) {
      text = `No definitions found in ${sicd.files.length} SICD file(s).`
    } else if (messageCount + structs.length + enums.length === 0) {
      text = `Nothing matches "${filter}".`
    }

    return text ? (
      <Typography variant="body2" color="textSecondary" align="center" className={classes.emptyState}>
        {text}
      </Typography>
    ) : null
  }

  const hasDefinitions = sicd.messages.length + sicd.structs.length + sicd.enums.length > 0

  return (
    <Box className={classes.root}>
      <Box>
        <Typography variant="subtitle2" className={classes.title}>
          SICD
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Select a message or struct to load it into Publish
        </Typography>
      </Box>

      <Box className={classes.folderBar}>
        <Typography
          variant="caption"
          color="textSecondary"
          noWrap
          className={classes.folderPath}
          title={sicd.folderPath}
        >
          {sicd.folderPath ? `${sicd.folderPath} (${sicd.files.length} files)` : 'No folder selected'}
        </Typography>
        <Tooltip title="Choose SICD folder">
          <IconButton size="small" onClick={chooseFolder} id="sicd-choose-folder">
            <FolderOpen fontSize="small" />
          </IconButton>
        </Tooltip>
        {!isBrowserMode && (
          <Tooltip title="Reload SICD folder">
            <span>
              <IconButton
                size="small"
                onClick={actions.reloadSicdFolder}
                disabled={!sicd.folderPath || sicd.loading}
                id="sicd-reload"
              >
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
        {isBrowserMode && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleBrowserFiles}
            {...({ webkitdirectory: '' } as any)}
          />
        )}
      </Box>

      {sicd.loading && <LinearProgress />}

      {sicd.warnings.length > 0 && (
        <Alert
          severity="warning"
          className={classes.warnings}
          onClick={() => setWarningsVisible(!warningsVisible)}
          id="sicd-warnings"
        >
          {sicd.warnings.length} warning(s) while loading, click to {warningsVisible ? 'hide' : 'show'}
          <Collapse in={warningsVisible}>
            <ul className={classes.warningList}>
              {sicd.warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Collapse>
        </Alert>
      )}

      {hasDefinitions && (
        <TextField
          size="small"
          placeholder="Filter messages, structs, enums and values"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          id="sicd-filter"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      )}

      {hasDefinitions && (
        <Box>
          {renderGroup('messages', 'Messages', messageCount, true, () => (
            <MessageTree
              groups={messageGroups}
              selectedTopic={selectedTopic}
              onSelect={selectMessage}
              expansion={expansion}
            />
          ))}
          {renderGroup('structs', 'Structs', structs.length, false, () => (
            <StructList structs={structs} definitions={definitions} expansion={expansion} onLoad={loadStruct} />
          ))}
          {renderGroup('enums', 'Enums', enums.length, false, () => (
            <EnumList enums={enums} expansion={expansion} />
          ))}
        </Box>
      )}
      {renderEmptyState()}
    </Box>
  )
}

const mapStateToProps = (state: AppState) => ({
  sicd: state.sicd,
})

const mapDispatchToProps = (dispatch: any) => ({
  actions: bindActionCreators(sicdActions, dispatch),
})

const styles = (theme: Theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: theme.spacing(1.5),
  },
  title: {
    fontWeight: 600,
    color: theme.palette.text.primary,
    fontSize: '0.875rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: theme.spacing(0.5),
  },
  folderBar: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  folderPath: {
    flex: 1,
    minWidth: 0,
  },
  warnings: {
    cursor: 'pointer',
  },
  warningList: {
    margin: theme.spacing(1, 0, 0, 0),
    paddingLeft: theme.spacing(2),
    wordBreak: 'break-word' as const,
  },
  emptyState: {
    padding: theme.spacing(3, 1),
  },
})

export default withStyles(styles)(connect(mapStateToProps, mapDispatchToProps)(SicdTab))

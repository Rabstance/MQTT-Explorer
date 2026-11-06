import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import FolderOpen from '@mui/icons-material/FolderOpen'
import Refresh from '@mui/icons-material/Refresh'
import Search from '@mui/icons-material/Search'
import { AppState } from '../../reducers'
import { BdState } from '../../reducers/Bd'
import { bdActions } from '../../actions'
import { isBrowserMode } from '../../utils/browserMode'
import { BdMessageList } from './Bd/BdMessageList'
import { displayDefinitions, groupByFile } from './Bd/displayDefinitions'
import { Expansion } from './Sicd/tree'

interface Props {
  bd: BdState
  actions: typeof bdActions
}

const titleSx = {
  fontWeight: 600,
  color: 'text.primary',
  fontSize: '0.875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  mb: 0.5,
}

/**
 * Loads the XML SICD message definitions and switches decoding of binary messages on and off
 */
function BdTab(props: Props) {
  const { actions, bd } = props
  const { catalog } = bd
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const [warningsVisible, setWarningsVisible] = useState(false)

  useEffect(() => {
    actions.restoreBd()
  }, [])

  const filterText = filter.trim().toLowerCase()
  const groups = useMemo(() => (catalog ? groupByFile(catalog, filterText) : []), [catalog, filterText])
  const definitions = useMemo(
    () => (catalog ? displayDefinitions(catalog) : { structs: new Map(), enums: new Map() }),
    [catalog]
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
      actions.chooseBdFolder()
    }
  }, [actions])

  const handleBrowserFiles = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        actions.loadBdBrowserFiles(event.target.files)
      }
      // Allow selecting the same folder again
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [actions]
  )

  const messageCount = groups.reduce((sum, group) => sum + group.messages.length, 0)
  const warnings = catalog?.warnings ?? []

  const renderEmptyState = () => {
    let text: string | undefined
    if (bd.loading) {
      text = undefined
    } else if (!catalog) {
      text = 'Choose the folder containing your SICD *.xml message files.'
    } else if (catalog.messages.length === 0) {
      text = `No messages found in ${catalog.files.length} XML file(s).`
    } else if (messageCount === 0) {
      text = `Nothing matches "${filter}".`
    }

    return text ? (
      <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 3, px: 1 }}>
        {text}
      </Typography>
    ) : null
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} id="bd-tab">
      <Box>
        <Typography variant="subtitle2" sx={titleSx}>
          BD
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Shows binary messages as JSON, using the XML SICD message definitions
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography
          variant="caption"
          color="textSecondary"
          noWrap
          sx={{ flex: 1, minWidth: 0 }}
          title={bd.folderPath}
          id="bd-folder"
        >
          {bd.folderPath && catalog ? `${bd.folderPath} (${catalog.files.length} files)` : 'No folder selected'}
        </Typography>
        <Tooltip title="Choose BD SICD folder">
          <IconButton size="small" onClick={chooseFolder} id="bd-choose-folder">
            <FolderOpen fontSize="small" />
          </IconButton>
        </Tooltip>
        {!isBrowserMode && (
          <Tooltip title="Reload BD SICD folder">
            <span>
              <IconButton
                size="small"
                onClick={actions.reloadBdFolder}
                disabled={!bd.folderPath || bd.loading}
                id="bd-reload"
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

      {bd.loading && <LinearProgress />}

      <Box>
        <FormControlLabel
          control={
            <Switch
              checked={bd.enabled}
              onChange={(_event, checked) => actions.setBdDecoding(checked)}
              disabled={!catalog}
              id="bd-decode-switch"
            />
          }
          label="Decode binary messages"
        />
        <Typography variant="caption" color="textSecondary" component="div">
          Topics ending in a message name, e.g. SYSTEM/MODULE/MessageName, or messages whose header matches a message
          are decoded. A decoder can also be chosen for a single topic with the type button of its value.
        </Typography>
      </Box>

      {catalog && (
        <Typography variant="caption" color="textSecondary" id="bd-summary">
          {catalog.messages.length} messages in {catalog.files.length} files
          {catalog.ignoredFiles.length > 0 &&
            ` · ${catalog.ignoredFiles.length} other XML file(s) ignored (${catalog.ignoredFiles.join(', ')})`}
        </Typography>
      )}

      {warnings.length > 0 && (
        <Alert
          severity="warning"
          sx={{ cursor: 'pointer' }}
          onClick={() => setWarningsVisible(!warningsVisible)}
          id="bd-warnings"
        >
          {warnings.length} warning(s) while loading, click to {warningsVisible ? 'hide' : 'show'}
          <Collapse in={warningsVisible}>
            <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2, wordBreak: 'break-word' }}>
              {warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </Box>
          </Collapse>
        </Alert>
      )}

      {catalog && catalog.messages.length > 0 && (
        <TextField
          size="small"
          placeholder="Filter files, messages and fields"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          id="bd-filter"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      )}

      {catalog && messageCount > 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <BdMessageList groups={groups} catalog={catalog} definitions={definitions} expansion={expansion} />
        </Box>
      )}
      {renderEmptyState()}
    </Box>
  )
}

const mapStateToProps = (state: AppState) => ({
  bd: state.bd,
})

const mapDispatchToProps = (dispatch: any) => ({
  actions: bindActionCreators(bdActions, dispatch),
})

export default connect(mapStateToProps, mapDispatchToProps)(BdTab)

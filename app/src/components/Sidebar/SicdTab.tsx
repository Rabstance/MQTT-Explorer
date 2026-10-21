import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { Theme } from '@mui/material/styles'
import { withStyles } from '@mui/styles'
import { connect } from 'react-redux'
import { bindActionCreators } from 'redux'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import FolderOpen from '@mui/icons-material/FolderOpen'
import Refresh from '@mui/icons-material/Refresh'
import Search from '@mui/icons-material/Search'
import { AppState } from '../../reducers'
import { SicdState } from '../../reducers/Sicd'
import { sicdActions } from '../../actions'
import { isBrowserMode } from '../../utils/browserMode'
import { SICD_SECTIONS, SicdMessage, SicdSection } from '../../sicd/types'

interface Props {
  sicd: SicdState
  actions: typeof sicdActions
  classes: any
  /** Called after a message has been loaded into the publish section */
  onMessageSelected?: () => void
}

interface ElementGroup {
  element: string
  sections: Array<{ section: SicdSection; messages: Array<SicdMessage> }>
}

function groupMessages(messages: Array<SicdMessage>, filter: string): Array<ElementGroup> {
  const elements = new Map<string, ElementGroup>()

  for (const message of messages) {
    if (filter && !message.topic.includes(filter)) {
      continue
    }

    const elementKey = message.element.toLowerCase()
    let group = elements.get(elementKey)
    if (!group) {
      group = { element: message.element, sections: [] }
      elements.set(elementKey, group)
    }

    let section = group.sections.find(s => s.section === message.section)
    if (!section) {
      section = { section: message.section, messages: [] }
      group.sections.push(section)
    }
    section.messages.push(message)
  }

  const groups = Array.from(elements.values()).sort((a, b) => a.element.localeCompare(b.element))
  for (const group of groups) {
    group.sections.sort((a, b) => SICD_SECTIONS.indexOf(a.section) - SICD_SECTIONS.indexOf(b.section))
    group.sections.forEach(s => s.messages.sort((a, b) => a.name.localeCompare(b.name)))
  }

  return groups
}

// Children are indented below the expand icon of their parent with a vertical guide line in its center
const indentGuideSx = {
  ml: '13px',
  borderLeft: 1,
  borderColor: 'divider',
}

const chipSx = {
  height: '20px',
  fontSize: '0.7rem',
  ml: 0.5,
}

function SicdTab(props: Props) {
  const { classes, actions, sicd } = props
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const [selectedTopic, setSelectedTopic] = useState<string | undefined>()
  const [warningsVisible, setWarningsVisible] = useState(false)

  useEffect(() => {
    actions.restoreSicd()
  }, [])

  const filterText = filter.trim().toLowerCase()
  const groups = useMemo(() => groupMessages(sicd.messages, filterText), [sicd.messages, filterText])

  // Elements are expanded and sections collapsed by default, everything is expanded while filtering
  const isOpen = (key: string, defaultOpen: boolean) =>
    Boolean(filterText) || (toggled.has(key) ? !defaultOpen : defaultOpen)

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

  const { onMessageSelected } = props
  const selectMessage = useCallback(
    (message: SicdMessage) => {
      actions.selectSicdMessage(message)
      setSelectedTopic(message.topic)
      onMessageSelected?.()
    },
    [actions, onMessageSelected]
  )

  // Styles of MUI components are set with `sx`, withStyles classes lose against the MUI defaults
  const renderMessage = (message: SicdMessage) => (
    <ListItemButton
      key={message.topic}
      // Leaves start where the label of a branch would, after the space of the expand icon
      sx={{ pl: 3.5, pr: 1, py: 0.25 }}
      selected={message.topic === selectedTopic}
      onClick={() => selectMessage(message)}
      data-topic={message.topic}
    >
      <ListItemText
        sx={{ my: 0.25 }}
        primary={message.name}
        secondary={message.topic}
        primaryTypographyProps={{ variant: 'body2' }}
        secondaryTypographyProps={{ variant: 'caption', sx: { fontFamily: 'monospace' } }}
      />
      {message.retain && <Chip label="retained" size="small" variant="outlined" sx={chipSx} />}
      {message.isDatabaseMsg && <Chip label="DB" size="small" variant="outlined" sx={chipSx} />}
    </ListItemButton>
  )

  const renderBranch = (key: string, label: string, count: number, open: boolean, fontWeight: number) => (
    <ListItemButton sx={{ pl: 0.5, pr: 1, gap: 0.5 }} onClick={() => toggle(key)} aria-expanded={open} data-node={key}>
      {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
      <ListItemText primary={label} primaryTypographyProps={{ variant: 'body2', sx: { fontWeight } }} />
      <Typography variant="caption" color="textSecondary">
        {count}
      </Typography>
    </ListItemButton>
  )

  const renderTree = () => (
    <List dense disablePadding id="sicd-message-tree">
      {groups.map(group => {
        const elementKey = group.element.toLowerCase()
        const elementOpen = isOpen(elementKey, true)
        const messageCount = group.sections.reduce((sum, section) => sum + section.messages.length, 0)

        return (
          <React.Fragment key={elementKey}>
            {renderBranch(elementKey, group.element, messageCount, elementOpen, 600)}
            <Collapse in={elementOpen} unmountOnExit>
              <Box sx={indentGuideSx}>
                {group.sections.map(({ section, messages }) => {
                  const sectionKey = `${elementKey}/${section.toLowerCase()}`
                  const sectionOpen = isOpen(sectionKey, false)

                  return (
                    <React.Fragment key={sectionKey}>
                      {renderBranch(sectionKey, section, messages.length, sectionOpen, 500)}
                      <Collapse in={sectionOpen} unmountOnExit>
                        <Box sx={indentGuideSx}>{messages.map(renderMessage)}</Box>
                      </Collapse>
                    </React.Fragment>
                  )
                })}
              </Box>
            </Collapse>
          </React.Fragment>
        )
      })}
    </List>
  )

  const renderEmptyState = () => {
    let text: string | undefined
    if (sicd.loading) {
      text = undefined
    } else if (sicd.files.length === 0 && !sicd.folderPath) {
      text = 'Choose the folder containing your SICD *.json5 files.'
    } else if (sicd.messages.length === 0) {
      text = `No messages found in ${sicd.files.length} SICD file(s).`
    } else if (groups.length === 0) {
      text = `No messages match "${filter}".`
    }

    return text ? (
      <Typography variant="body2" color="textSecondary" align="center" className={classes.emptyState}>
        {text}
      </Typography>
    ) : null
  }

  return (
    <Box className={classes.root}>
      <Box>
        <Typography variant="subtitle2" className={classes.title}>
          SICD Messages
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Select a message to load its topic and payload into Publish
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

      {sicd.messages.length > 0 && (
        <TextField
          size="small"
          placeholder="Filter messages"
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

      {renderTree()}
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

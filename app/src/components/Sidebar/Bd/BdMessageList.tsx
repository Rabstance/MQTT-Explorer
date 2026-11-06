import React, { useMemo } from 'react'
import { Box, Chip, Collapse, List, Typography } from '@mui/material'
import { BdCatalog, BdMessageDef } from '../../../bd/types'
import { FieldList } from '../Sicd/FieldList'
import { TreeBranch } from '../Sicd/TreeBranch'
import { Expansion, SicdDefinitions, chipSx, indentGuideSx } from '../Sicd/tree'
import { FileGroup, fieldInfo, messageSummary } from './displayDefinitions'

interface Props {
  groups: Array<FileGroup>
  catalog: BdCatalog
  definitions: SicdDefinitions
  expansion: Expansion
}

const sectionLabelSx = {
  display: 'block',
  pl: 1,
  pt: 0.5,
  fontWeight: 600,
  color: 'text.secondary',
}

function MessageFields(props: { message: BdMessageDef } & Omit<Props, 'groups'>) {
  const { message, catalog, definitions, expansion } = props
  const header = useMemo(() => message.header.map(field => fieldInfo(field, catalog)), [message, catalog])
  const payload = useMemo(() => message.payload.map(field => fieldInfo(field, catalog)), [message, catalog])
  const key = `message:${message.id}`

  return (
    <Box sx={{ pb: 0.5 }}>
      {message.comment && (
        <Typography variant="caption" color="textSecondary" component="div" sx={{ pl: 1, whiteSpace: 'pre-line' }}>
          {message.comment}
        </Typography>
      )}
      {header.length > 0 && (
        <>
          <Typography variant="caption" sx={sectionLabelSx}>
            Header{message.headerSize !== undefined && ` · ${message.headerSize} bytes`}
          </Typography>
          <FieldList
            fields={header}
            path={`${key}/header`}
            ancestors={[]}
            definitions={definitions}
            expansion={expansion}
          />
        </>
      )}
      <Typography variant="caption" sx={sectionLabelSx}>
        Payload{message.payloadSize !== undefined && ` · ${message.payloadSize} bytes`}
      </Typography>
      {payload.length > 0 ? (
        <FieldList
          fields={payload}
          path={`${key}/payload`}
          ancestors={[]}
          definitions={definitions}
          expansion={expansion}
        />
      ) : (
        <Typography variant="caption" color="textSecondary" component="div" sx={{ pl: 1 }}>
          No payload
        </Typography>
      )}
    </Box>
  )
}

/**
 * Message definitions grouped by file, a message expands to its header and payload fields
 */
export function BdMessageList(props: Props) {
  const { groups, expansion } = props

  return (
    <List dense disablePadding id="bd-message-list">
      {groups.map(group => {
        const fileKey = `file:${group.file}`
        const fileOpen = expansion.isOpen(fileKey, false)
        return (
          <Box key={group.file} data-file={group.file}>
            <TreeBranch
              nodeKey={fileKey}
              label={group.file}
              count={group.messages.length}
              open={fileOpen}
              onToggle={expansion.toggle}
            />
            <Collapse in={fileOpen} unmountOnExit>
              <Box sx={indentGuideSx}>
                {group.messages.map(message => {
                  const messageKey = `message:${message.id}`
                  const messageOpen = expansion.isOpen(messageKey, false, false)
                  return (
                    <Box key={message.id} data-message={message.name}>
                      <TreeBranch
                        nodeKey={messageKey}
                        label={
                          <>
                            {message.name}
                            {message.bigEndian && <Chip label="big endian" size="small" sx={chipSx} />}
                          </>
                        }
                        secondary={messageSummary(message)}
                        open={messageOpen}
                        onToggle={expansion.toggle}
                      />
                      <Collapse in={messageOpen} unmountOnExit>
                        <Box sx={indentGuideSx}>
                          <MessageFields
                            message={message}
                            catalog={props.catalog}
                            definitions={props.definitions}
                            expansion={expansion}
                          />
                        </Box>
                      </Collapse>
                    </Box>
                  )
                })}
              </Box>
            </Collapse>
          </Box>
        )
      })}
    </List>
  )
}

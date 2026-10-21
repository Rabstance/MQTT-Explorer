import React from 'react'
import { Box, Chip, Collapse, List, ListItemButton, ListItemText } from '@mui/material'
import { SICD_SECTIONS, SicdMessage, SicdSection } from '../../../sicd/types'
import { TreeBranch } from './TreeBranch'
import { Expansion, chipSx, indentGuideSx, monospaceSx } from './tree'

export interface ElementGroup {
  element: string
  sections: Array<{ section: SicdSection; messages: Array<SicdMessage> }>
}

/**
 * Groups messages by element and section, `filter` is matched against the topic
 */
export function groupMessages(messages: Array<SicdMessage>, filter: string): Array<ElementGroup> {
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

interface Props {
  groups: Array<ElementGroup>
  selectedTopic?: string
  onSelect: (message: SicdMessage) => void
  expansion: Expansion
}

export function MessageTree(props: Props) {
  const { groups, expansion } = props

  const renderMessage = (message: SicdMessage) => (
    <ListItemButton
      key={message.topic}
      // Leaves start where the label of a branch would, after the space of the expand icon
      sx={{ pl: 3.5, pr: 1, py: 0.25 }}
      selected={message.topic === props.selectedTopic}
      onClick={() => props.onSelect(message)}
      data-topic={message.topic}
    >
      <ListItemText
        sx={{ my: 0.25 }}
        primary={message.name}
        secondary={message.topic}
        primaryTypographyProps={{ variant: 'body2' }}
        secondaryTypographyProps={{ variant: 'caption', sx: monospaceSx }}
      />
      {message.retain && <Chip label="retained" size="small" variant="outlined" sx={chipSx} />}
      {message.isDatabaseMsg && <Chip label="DB" size="small" variant="outlined" sx={chipSx} />}
    </ListItemButton>
  )

  return (
    <List dense disablePadding id="sicd-message-tree">
      {groups.map(group => {
        const elementKey = group.element.toLowerCase()
        const elementOpen = expansion.isOpen(elementKey, true)
        const messageCount = group.sections.reduce((sum, section) => sum + section.messages.length, 0)

        return (
          <React.Fragment key={elementKey}>
            <TreeBranch
              nodeKey={elementKey}
              label={group.element}
              count={messageCount}
              open={elementOpen}
              onToggle={expansion.toggle}
              labelSx={{ fontWeight: 600 }}
            />
            <Collapse in={elementOpen} unmountOnExit>
              <Box sx={indentGuideSx}>
                {group.sections.map(({ section, messages }) => {
                  const sectionKey = `${elementKey}/${section.toLowerCase()}`
                  const sectionOpen = expansion.isOpen(sectionKey, false)

                  return (
                    <React.Fragment key={sectionKey}>
                      <TreeBranch
                        nodeKey={sectionKey}
                        label={section}
                        count={messages.length}
                        open={sectionOpen}
                        onToggle={expansion.toggle}
                        labelSx={{ fontWeight: 500 }}
                      />
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
}

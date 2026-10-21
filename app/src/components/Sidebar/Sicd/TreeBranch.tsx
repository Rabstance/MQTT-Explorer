import React from 'react'
import { ListItemButton, ListItemText, Typography } from '@mui/material'
import { SxProps, Theme } from '@mui/material/styles'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'

interface Props {
  nodeKey: string
  label: React.ReactNode
  secondary?: React.ReactNode
  count?: number
  open: boolean
  onToggle: (key: string) => void
  labelSx?: SxProps<Theme>
}

/**
 * Expandable node of the SICD tree
 */
export function TreeBranch(props: Props) {
  const { nodeKey, open, onToggle, secondary } = props
  const iconSx = secondary ? { mt: '3px' } : undefined

  return (
    <ListItemButton
      sx={{ pl: 0.5, pr: 1, gap: 0.5, alignItems: secondary ? 'flex-start' : 'center' }}
      onClick={() => onToggle(nodeKey)}
      aria-expanded={open}
      data-node={nodeKey}
    >
      {open ? <ExpandMore fontSize="small" sx={iconSx} /> : <ChevronRight fontSize="small" sx={iconSx} />}
      <ListItemText
        sx={{ my: 0.25, minWidth: 0 }}
        primary={props.label}
        secondary={secondary}
        primaryTypographyProps={{ variant: 'body2', sx: { overflowWrap: 'anywhere', ...(props.labelSx as object) } }}
        secondaryTypographyProps={{ variant: 'caption' }}
      />
      {props.count !== undefined && (
        <Typography variant="caption" color="textSecondary" sx={{ mt: secondary ? '3px' : 0 }}>
          {props.count}
        </Typography>
      )}
    </ListItemButton>
  )
}

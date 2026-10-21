import React from 'react'
import { Box, Collapse, Typography } from '@mui/material'
import { SicdEnumInfo } from '../../../sicd/types'
import { EnumValues } from './EnumValues'
import { TreeBranch } from './TreeBranch'
import { Expansion, indentGuideSx, monospaceSx } from './tree'

interface Props {
  enums: Array<SicdEnumInfo>
  expansion: Expansion
}

export function EnumList(props: Props) {
  const { expansion } = props

  return (
    <Box id="sicd-enum-list">
      {props.enums.map(enumInfo => {
        const key = `enum:${enumInfo.id}`
        const open = expansion.isOpen(key, false, false)
        const size = enumInfo.type ?? 'size not specified'

        return (
          <React.Fragment key={enumInfo.id}>
            <TreeBranch
              nodeKey={key}
              label={enumInfo.id}
              secondary={`${enumInfo.values.length} values · ${size} · ${enumInfo.files.join(', ')}`}
              open={open}
              onToggle={expansion.toggle}
              labelSx={monospaceSx}
            />
            <Collapse in={open} unmountOnExit>
              <Box sx={indentGuideSx}>
                {enumInfo.comment && (
                  <Typography variant="caption" color="textSecondary" component="div" sx={{ pl: 1.5, pr: 1, pt: 0.5 }}>
                    {enumInfo.comment}
                  </Typography>
                )}
                <EnumValues enumInfo={enumInfo} />
              </Box>
            </Collapse>
          </React.Fragment>
        )
      })}
    </Box>
  )
}

import React from 'react'
import { Box, Button, Collapse, Typography } from '@mui/material'
import Input from '@mui/icons-material/Input'
import { SicdStructInfo } from '../../../sicd/types'
import { FieldList } from './FieldList'
import { TreeBranch } from './TreeBranch'
import { Expansion, SicdDefinitions, indentGuideSx, monospaceSx } from './tree'

interface Props {
  structs: Array<SicdStructInfo>
  definitions: SicdDefinitions
  expansion: Expansion
  onLoad: (struct: SicdStructInfo) => void
}

export function StructList(props: Props) {
  const { expansion } = props

  return (
    <Box id="sicd-struct-list">
      {props.structs.map(struct => {
        const key = `struct:${struct.id}`
        const open = expansion.isOpen(key, false, false)

        return (
          <React.Fragment key={struct.id}>
            <TreeBranch
              nodeKey={key}
              label={struct.id}
              secondary={`${struct.fields.length} fields · ${struct.files.join(', ')}`}
              open={open}
              onToggle={expansion.toggle}
              labelSx={monospaceSx}
            />
            <Collapse in={open} unmountOnExit>
              <Box sx={indentGuideSx}>
                {struct.comment && (
                  <Typography variant="caption" color="textSecondary" component="div" sx={{ pl: 1.5, pr: 1, pt: 0.5 }}>
                    {struct.comment}
                  </Typography>
                )}
                <Box sx={{ pl: 1.5, py: 0.5 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Input />}
                    onClick={() => props.onLoad(struct)}
                    data-load-struct={struct.id}
                  >
                    Load into Publish
                  </Button>
                </Box>
                <FieldList
                  fields={struct.fields}
                  path={key}
                  ancestors={[struct.id]}
                  definitions={props.definitions}
                  expansion={expansion}
                />
              </Box>
            </Collapse>
          </React.Fragment>
        )
      })}
    </Box>
  )
}

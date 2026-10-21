import React from 'react'
import { Box, Typography } from '@mui/material'
import Copy from '../../helper/Copy'
import { SicdEnumInfo } from '../../../sicd/types'
import { monospaceSx } from './tree'

/**
 * Values of an enum, the value names can be copied to fill in payloads
 */
export function EnumValues(props: { enumInfo: SicdEnumInfo }) {
  return (
    <Box data-enum-values={props.enumInfo.id}>
      {props.enumInfo.values.map(value => (
        <Box key={value.name} sx={{ display: 'flex', alignItems: 'center', pl: 3.5, pr: 0.5, minHeight: '32px' }}>
          <Typography variant="body2" sx={{ ...monospaceSx, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {value.name}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ ...monospaceSx, mx: 1 }}>
            {value.value}
          </Typography>
          <Copy value={value.name} />
        </Box>
      ))}
    </Box>
  )
}

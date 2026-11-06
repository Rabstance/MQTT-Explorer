import React from 'react'
import { Box, Collapse, Typography } from '@mui/material'
import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { SicdFieldInfo, SicdFieldKind } from '../../../sicd/types'
import { EnumValues } from './EnumValues'
import { Expansion, SicdDefinitions, indentGuideSx, monospaceSx } from './tree'

interface Props {
  fields: Array<SicdFieldInfo>
  /** Expansion key prefix, unique for every place the fields are shown */
  path: string
  /** Ids of the structs containing these fields, prevents expanding recursive structs forever */
  ancestors: Array<string>
  definitions: SicdDefinitions
  expansion: Expansion
}

const typeColor: { [kind in SicdFieldKind]: string } = {
  primitive: 'text.secondary',
  enum: 'success.main',
  struct: 'primary.main',
  unknown: 'error.main',
}

function typeLabel(field: SicdFieldInfo) {
  return field.maxCount !== undefined && field.maxCount !== 1 ? `${field.type}[${field.maxCount}]` : field.type
}

function formatDefault(field: SicdFieldInfo) {
  return field.kind === 'enum' && typeof field.default === 'string' ? field.default : JSON.stringify(field.default)
}

function constraints(field: SicdFieldInfo): string | undefined {
  const parts = []
  if (field.min !== undefined) {
    parts.push(`min ${field.min}`)
  }
  if (field.max !== undefined) {
    parts.push(`max ${field.max}`)
  }
  if (field.default !== undefined) {
    parts.push(`default ${formatDefault(field)}`)
  }
  if (field.units) {
    parts.push(`units ${field.units}`)
  }
  if (field.scalingFactor) {
    parts.push(`scaling ${field.scalingFactor}`)
  }

  return parts.length > 0 ? parts.join(' · ') : undefined
}

/**
 * Fields of a struct with their type, constraints and comment.
 * Fields of a struct or enum type can be expanded to show the nested fields or enum values.
 */
export function FieldList(props: Props) {
  return (
    <Box>
      {props.fields.map(field => (
        <FieldRow key={field.name} {...props} field={field} />
      ))}
    </Box>
  )
}

function FieldRow(props: Props & { field: SicdFieldInfo }) {
  const { field, ...listProps } = props
  const { definitions, expansion } = listProps
  const key = `${props.path}/${field.name}`
  const struct = field.kind === 'struct' && field.ref ? definitions.structs.get(field.ref) : undefined
  const enumInfo = field.kind === 'enum' && field.ref ? definitions.enums.get(field.ref) : undefined
  const recursive = Boolean(struct && props.ancestors.includes(struct.id))
  const expandable = Boolean((struct && !recursive) || enumInfo)
  const open = expandable && expansion.isOpen(key, false, false)
  const details = constraints(field)

  return (
    <>
      <Box
        role={expandable ? 'button' : undefined}
        aria-expanded={expandable ? open : undefined}
        data-field={key}
        onClick={expandable ? () => expansion.toggle(key) : undefined}
        sx={{
          display: 'flex',
          gap: 0.5,
          pl: 0.5,
          pr: 1,
          py: 0.5,
          cursor: expandable ? 'pointer' : 'default',
          '&:hover': expandable ? { bgcolor: 'action.hover' } : {},
        }}
      >
        <Box sx={{ width: '20px', flexShrink: 0, mt: '1px' }}>
          {expandable && (open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />)}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
              {field.name}
            </Typography>
            <Typography variant="body2" sx={{ ...monospaceSx, color: typeColor[field.kind], overflowWrap: 'anywhere' }}>
              {typeLabel(field)}
            </Typography>
            {field.kind === 'unknown' && (
              <Typography variant="caption" color="error">
                unknown type
              </Typography>
            )}
            {recursive && (
              <Typography variant="caption" color="textSecondary">
                recursive
              </Typography>
            )}
          </Box>
          {details && (
            <Typography variant="caption" color="textSecondary" component="div" sx={monospaceSx}>
              {details}
            </Typography>
          )}
          {field.comment && (
            <Typography variant="caption" color="textSecondary" component="div" sx={{ whiteSpace: 'pre-line' }}>
              {field.comment}
            </Typography>
          )}
        </Box>
      </Box>
      {expandable && (
        <Collapse in={open} unmountOnExit>
          <Box sx={indentGuideSx}>
            {struct && (
              <FieldList {...listProps} fields={struct.fields} path={key} ancestors={[...props.ancestors, struct.id]} />
            )}
            {enumInfo && <EnumValues enumInfo={enumInfo} />}
          </Box>
        </Collapse>
      )}
    </>
  )
}

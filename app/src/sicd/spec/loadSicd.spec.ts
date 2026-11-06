import { expect } from 'chai'
import 'mocha'
import { loadSicdFiles } from '../loadSicd'
import { SicdSourceFile } from '../types'

const typesFile: SicdSourceFile = {
  name: 'common_types.json5',
  content: `{
    // Shared type definitions
    Info: { Element: '', DefId: "TypeDef", Version: '0.1' },
    Includes: [],
    Constants: [],
    Enums: [
      { Name: 'E_RESULT', Enum: { SUCCESS: 0, FAILED: 1 } },
      { Name: 'E_UNIT_STATE', Enum: { OFFLINE: 0, OPERATIONAL: 2 } },
      { Name: 'E_FLAG', Enum: { FALSE: 0, TRUE: 1 } },
    ],
    Structs: [
      {
        Name: 'sPOINT',
        Struct: {
          XM: { Type: 'F4', Default: 1.5 },
          YM: { Type: 'F4' },
        },
      },
      {
        Name: 'sSTATE',
        Struct: {
          Element: { Type: 'E_UNIT_STATE', Default: 'OPERATIONAL' },
          Busy: { Type: 'E_FLAG' },
          Title: { Type: 'CH', MaxCount: 16, Default: 'unit' },
          Points: { Type: 'sPOINT', MaxCount: 16, UseStruct: true },
          Channels: { Type: 'E_FLAG', MaxCount: 24, Default: 'TRUE' },
        },
      },
    ],
  }`,
}

const messageFile: SicdSourceFile = {
  name: 'element_msg.json5',
  content: `{
    Info: { Element: 'UNIT', DefId: "Msg", Version: '0.1' },
    Includes: [ 'common_types.json5', ],
    Enums: [],
    Structs: [],
    Messages: [
      {
        Name: 'Setup',
        Cmd: {},
        CmdRsp: {
          Result: { Type: 'E_RESULT', Default: 'SUCCESS' },
        },
      },
      {
        Name: 'Summary',
        State: {
          UnitState: { Type: 'sSTATE', UseStruct: true },
        },
        Retained: ["State"],
      },
      {
        Name: 'Summary',
        Status: {
          Count: { Type: 'U4', Default: 7 },
        },
      },
      {
        Name: 'Zones',
        Cmd: { Threshold: { Type: 'I1' } },
        IsDatabaseMsg: true,
      },
    ],
  }`,
}

function load(...files: Array<SicdSourceFile>) {
  return loadSicdFiles(files)
}

function payloadOf(topic: string, ...files: Array<SicdSourceFile>) {
  const message = load(...files).messages.find(m => m.topic === topic)
  expect(message, `message ${topic}`).to.not.eq(undefined)

  return JSON.parse(message!.payload)
}

describe('loadSicdFiles', () => {
  it('derives lower case topics from element, section and message name', () => {
    const { messages, warnings } = load(typesFile, messageFile)

    expect(warnings).to.deep.eq([])
    expect(messages.map(m => m.topic)).to.deep.eq([
      'unit/cmd/setup',
      'unit/cmdrsp/setup',
      'unit/state/summary',
      'unit/status/summary',
      'unit/cmd/zones',
    ])
  })

  it('keeps the original element, section and name of a message', () => {
    const message = load(typesFile, messageFile).messages.find(m => m.topic === 'unit/cmdrsp/setup')!

    expect(message.element).to.eq('UNIT')
    expect(message.section).to.eq('CmdRsp')
    expect(message.name).to.eq('Setup')
    expect(message.file).to.eq('element_msg.json5')
  })

  it('generates an empty object for sections without fields', () => {
    expect(payloadOf('unit/cmd/setup', typesFile, messageFile)).to.deep.eq({})
  })

  it('uses enum names and numeric defaults', () => {
    expect(payloadOf('unit/cmdrsp/setup', typesFile, messageFile)).to.deep.eq({ Result: 'SUCCESS' })
    expect(payloadOf('unit/status/summary', typesFile, messageFile)).to.deep.eq({ Count: 7 })
    expect(payloadOf('unit/cmd/zones', typesFile, messageFile)).to.deep.eq({ Threshold: 0 })
  })

  it('resolves included structs and generates arrays with a single element', () => {
    expect(payloadOf('unit/state/summary', typesFile, messageFile)).to.deep.eq({
      UnitState: {
        Element: 'OPERATIONAL',
        Busy: 'FALSE',
        Title: 'unit',
        Points: [{ XM: 1.5, YM: 0 }],
        Channels: ['TRUE'],
      },
    })
  })

  it('marks retained sections and database messages', () => {
    const { messages } = load(typesFile, messageFile)
    const byTopic = (topic: string) => messages.find(m => m.topic === topic)!

    expect(byTopic('unit/state/summary').retain).to.eq(true)
    expect(byTopic('unit/status/summary').retain).to.eq(false)
    expect(byTopic('unit/cmd/zones').isDatabaseMsg).to.eq(true)
    expect(byTopic('unit/cmd/setup').isDatabaseMsg).to.eq(false)
  })

  it('resolves includes by file name regardless of path and case', () => {
    const includeWithPath = {
      ...messageFile,
      content: messageFile.content.replace("'common_types.json5'", "'../types/COMMON_TYPES.json5'"),
    }

    expect(load(typesFile, includeWithPath).warnings).to.deep.eq([])
  })

  it('reports missing includes and unknown types', () => {
    const { messages, warnings } = load(messageFile)

    expect(messages.length).to.eq(5)
    expect(warnings).to.include(
      "element_msg.json5: include 'common_types.json5' was not found in the SICD folder or could not be parsed"
    )
    expect(warnings).to.include("element_msg.json5: Setup.CmdRsp.Result: unknown type 'E_RESULT'")
  })

  it('reports invalid enum defaults', () => {
    const invalidDefault = {
      ...messageFile,
      content: messageFile.content.replace("Default: 'SUCCESS'", "Default: 'GREAT'"),
    }
    const { warnings } = load(typesFile, invalidDefault)

    expect(warnings).to.deep.eq(["element_msg.json5: Setup.CmdRsp.Result: default 'GREAT' is not a value of E_RESULT"])
    expect(payloadOf('unit/cmdrsp/setup', typesFile, invalidDefault)).to.deep.eq({ Result: 'SUCCESS' })
  })

  it('reports files that cannot be parsed and continues with the others', () => {
    const broken = { name: 'broken.json5', content: '{ Info: ' }
    const { messages, warnings } = load(typesFile, messageFile, broken)

    expect(messages.length).to.eq(5)
    expect(warnings.length).to.eq(1)
    expect(warnings[0]).to.match(/^broken\.json5: /)
  })

  it('skips message files without an element name', () => {
    const noElement = { ...messageFile, content: messageFile.content.replace("Element: 'UNIT'", "Element: ''") }
    const { messages, warnings } = load(typesFile, noElement)

    expect(messages).to.deep.eq([])
    expect(warnings).to.deep.eq(['element_msg.json5: defines messages but has no Info.Element, skipped'])
  })

  it('ignores duplicate topics and unknown sections', () => {
    const duplicates = {
      ...messageFile,
      content: messageFile.content.replace(
        "Name: 'Zones',",
        "Name: 'Setup', Event: { Value: { Type: 'U1' } }, Cmd: {}, Comment: 'duplicate',"
      ),
    }
    const { warnings } = load(typesFile, duplicates)

    expect(warnings).to.include("element_msg.json5: Setup: unknown section 'Event' ignored")
    expect(warnings).to.include("element_msg.json5: duplicate topic 'unit/cmd/setup' ignored")
  })

  it('treats a MaxCount constant as array length', () => {
    const withConstant = {
      ...typesFile,
      content: typesFile.content
        .replace('Constants: [],', "Constants: [{ Name: 'ONE', Value: 1 }, { Name: 'MANY', Value: 4 }],")
        .replace("Type: 'CH', MaxCount: 16", "Type: 'CH', MaxCount: 'MANY'")
        .replace("Type: 'sPOINT', MaxCount: 16", "Type: 'sPOINT', MaxCount: 'ONE'")
        .replace('MaxCount: 24', "MaxCount: 'MANY'"),
    }
    const state = payloadOf('unit/state/summary', withConstant, messageFile).UnitState

    expect(state.Title).to.eq('unit')
    expect(state.Points).to.deep.eq({ XM: 1.5, YM: 0 })
    expect(state.Channels).to.deep.eq(['TRUE'])
  })
})

describe('loadSicdFiles definitions', () => {
  it('lists all enums with their values, type and file', () => {
    const { enums } = load(typesFile, messageFile)

    expect(enums.map(e => e.id)).to.deep.eq(['E_RESULT', 'E_UNIT_STATE', 'E_FLAG'])
    expect(enums[1]).to.deep.eq({
      id: 'E_UNIT_STATE',
      name: 'E_UNIT_STATE',
      type: undefined,
      comment: undefined,
      values: [
        { name: 'OFFLINE', value: 0 },
        { name: 'OPERATIONAL', value: 2 },
      ],
      files: ['common_types.json5'],
    })
  })

  it('lists all structs with resolved field types and all field attributes', () => {
    const state = load(typesFile, messageFile).structs.find(s => s.id === 'sSTATE')!

    expect(state.files).to.deep.eq(['common_types.json5'])
    expect(state.fields.map(f => [f.name, f.kind, f.ref])).to.deep.eq([
      ['Element', 'enum', 'E_UNIT_STATE'],
      ['Busy', 'enum', 'E_FLAG'],
      ['Title', 'primitive', undefined],
      ['Points', 'struct', 'sPOINT'],
      ['Channels', 'enum', 'E_FLAG'],
    ])
    expect(state.fields[2]).to.deep.include({ type: 'CH', maxCount: 16, default: 'unit' })
  })

  it('generates a payload template for every struct', () => {
    const point = load(typesFile, messageFile).structs.find(s => s.id === 'sPOINT')!

    expect(JSON.parse(point.payload)).to.deep.eq({ XM: 1.5, YM: 0 })
  })

  it('keeps min, max and comments of fields', () => {
    const withRange = {
      ...typesFile,
      content: typesFile.content.replace(
        "XM: { Type: 'F4', Default: 1.5 }",
        "XM: { Type: 'F4', Default: 1.5, Min: 0, Max: 100000, Comment: 'Distance along the x axis' }"
      ),
    }
    const point = load(withRange).structs.find(s => s.id === 'sPOINT')!

    expect(point.fields[0]).to.deep.eq({
      name: 'XM',
      type: 'F4',
      kind: 'primitive',
      maxCount: undefined,
      min: 0,
      max: 100000,
      default: 1.5,
      comment: 'Distance along the x axis',
    })
  })

  it('merges identical definitions from several files', () => {
    const copy = { ...typesFile, name: 'copy_types.json5' }
    const { enums, structs } = load(typesFile, copy)

    expect(enums.length).to.eq(3)
    expect(structs.find(s => s.id === 'sSTATE')!.files).to.deep.eq(['common_types.json5', 'copy_types.json5'])
  })

  it('tells differing definitions with the same name apart by file', () => {
    const other: SicdSourceFile = {
      name: 'other_types.json5',
      content: "{ Enums: [{ Name: 'E_FLAG', Type: 'U1', Enum: { NO: 0, YES: 1 } }] }",
    }
    const { enums } = load(typesFile, other)

    expect(enums.filter(e => e.name === 'E_FLAG').map(e => e.id)).to.deep.eq([
      'E_FLAG (common_types.json5)',
      'E_FLAG (other_types.json5)',
    ])
    const state = load(typesFile, other).structs.find(s => s.id === 'sSTATE')!
    expect(state.fields[1].ref).to.eq('E_FLAG (common_types.json5)')
  })

  it('marks field types that can not be resolved', () => {
    const broken = { ...typesFile, content: typesFile.content.replace("Type: 'sPOINT'", "Type: 'sMISSING'") }
    const { structs, warnings } = load(broken)
    const points = structs.find(s => s.id === 'sSTATE')!.fields.find(f => f.name === 'Points')!

    expect(points.kind).to.eq('unknown')
    expect(points.ref).to.eq(undefined)
    expect(warnings).to.include("common_types.json5: sSTATE.Points: unknown type 'sMISSING'")
  })
})

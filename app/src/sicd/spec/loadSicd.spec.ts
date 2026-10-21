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
      { Name: 'E_MESSAGE_STATUS', Enum: { SUCCESS: 0, FAILED: 1 } },
      { Name: 'E_ELEMENT_STATE', Enum: { OFFLINE: 0, OPERATIONAL: 2 } },
      { Name: 'E_BOOL', Enum: { FALSE: 0, TRUE: 1 } },
    ],
    Structs: [
      {
        Name: 'sPOINT',
        Struct: {
          RangeM: { Type: 'F4', Default: 1.5 },
          AzimuthDeg: { Type: 'F4' },
        },
      },
      {
        Name: 'sSTATE',
        Struct: {
          Element: { Type: 'E_ELEMENT_STATE', Default: 'OPERATIONAL' },
          Overload: { Type: 'E_BOOL' },
          Title: { Type: 'CH', MaxCount: 16, Default: 'radar' },
          Points: { Type: 'sPOINT', MaxCount: 16, UseStruct: true },
          Receivers: { Type: 'E_BOOL', MaxCount: 24, Default: 'TRUE' },
        },
      },
    ],
  }`,
}

const messageFile: SicdSourceFile = {
  name: 'element_msg.json5',
  content: `{
    Info: { Element: 'SSP', DefId: "Msg", Version: '0.1' },
    Includes: [ 'common_types.json5', ],
    Enums: [],
    Structs: [],
    Messages: [
      {
        Name: 'Setup',
        Cmd: {},
        CmdRsp: {
          MessageStatus: { Type: 'E_MESSAGE_STATUS', Default: 'SUCCESS' },
        },
      },
      {
        Name: 'Detailed',
        State: {
          SspState: { Type: 'sSTATE', UseStruct: true },
        },
        Retained: ["State"],
      },
      {
        Name: 'Detailed',
        Status: {
          Count: { Type: 'U4', Default: 7 },
        },
      },
      {
        Name: 'Polygons',
        Cmd: { Margin_dB: { Type: 'I1' } },
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
      'ssp/cmd/setup',
      'ssp/cmdrsp/setup',
      'ssp/state/detailed',
      'ssp/status/detailed',
      'ssp/cmd/polygons',
    ])
  })

  it('keeps the original element, section and name of a message', () => {
    const message = load(typesFile, messageFile).messages.find(m => m.topic === 'ssp/cmdrsp/setup')!

    expect(message.element).to.eq('SSP')
    expect(message.section).to.eq('CmdRsp')
    expect(message.name).to.eq('Setup')
    expect(message.file).to.eq('element_msg.json5')
  })

  it('generates an empty object for sections without fields', () => {
    expect(payloadOf('ssp/cmd/setup', typesFile, messageFile)).to.deep.eq({})
  })

  it('uses enum names and numeric defaults', () => {
    expect(payloadOf('ssp/cmdrsp/setup', typesFile, messageFile)).to.deep.eq({ MessageStatus: 'SUCCESS' })
    expect(payloadOf('ssp/status/detailed', typesFile, messageFile)).to.deep.eq({ Count: 7 })
    expect(payloadOf('ssp/cmd/polygons', typesFile, messageFile)).to.deep.eq({ Margin_dB: 0 })
  })

  it('resolves included structs and generates arrays with a single element', () => {
    expect(payloadOf('ssp/state/detailed', typesFile, messageFile)).to.deep.eq({
      SspState: {
        Element: 'OPERATIONAL',
        Overload: 'FALSE',
        Title: 'radar',
        Points: [{ RangeM: 1.5, AzimuthDeg: 0 }],
        Receivers: ['TRUE'],
      },
    })
  })

  it('marks retained sections and database messages', () => {
    const { messages } = load(typesFile, messageFile)
    const byTopic = (topic: string) => messages.find(m => m.topic === topic)!

    expect(byTopic('ssp/state/detailed').retain).to.eq(true)
    expect(byTopic('ssp/status/detailed').retain).to.eq(false)
    expect(byTopic('ssp/cmd/polygons').isDatabaseMsg).to.eq(true)
    expect(byTopic('ssp/cmd/setup').isDatabaseMsg).to.eq(false)
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
    expect(warnings).to.include("element_msg.json5: Setup.CmdRsp.MessageStatus: unknown type 'E_MESSAGE_STATUS'")
  })

  it('reports invalid enum defaults', () => {
    const invalidDefault = {
      ...messageFile,
      content: messageFile.content.replace("Default: 'SUCCESS'", "Default: 'GREAT'"),
    }
    const { warnings } = load(typesFile, invalidDefault)

    expect(warnings).to.deep.eq([
      "element_msg.json5: Setup.CmdRsp.MessageStatus: default 'GREAT' is not a value of E_MESSAGE_STATUS",
    ])
    expect(payloadOf('ssp/cmdrsp/setup', typesFile, invalidDefault)).to.deep.eq({ MessageStatus: 'SUCCESS' })
  })

  it('reports files that cannot be parsed and continues with the others', () => {
    const broken = { name: 'broken.json5', content: '{ Info: ' }
    const { messages, warnings } = load(typesFile, messageFile, broken)

    expect(messages.length).to.eq(5)
    expect(warnings.length).to.eq(1)
    expect(warnings[0]).to.match(/^broken\.json5: /)
  })

  it('skips message files without an element name', () => {
    const noElement = { ...messageFile, content: messageFile.content.replace("Element: 'SSP'", "Element: ''") }
    const { messages, warnings } = load(typesFile, noElement)

    expect(messages).to.deep.eq([])
    expect(warnings).to.deep.eq(['element_msg.json5: defines messages but has no Info.Element, skipped'])
  })

  it('ignores duplicate topics and unknown sections', () => {
    const duplicates = {
      ...messageFile,
      content: messageFile.content.replace(
        "Name: 'Polygons',",
        "Name: 'Setup', Event: { Value: { Type: 'U1' } }, Cmd: {}, Comment: 'duplicate',"
      ),
    }
    const { warnings } = load(typesFile, duplicates)

    expect(warnings).to.include("element_msg.json5: Setup: unknown section 'Event' ignored")
    expect(warnings).to.include("element_msg.json5: duplicate topic 'ssp/cmd/setup' ignored")
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
    const state = payloadOf('ssp/state/detailed', withConstant, messageFile).SspState

    expect(state.Title).to.eq('radar')
    expect(state.Points).to.deep.eq({ RangeM: 1.5, AzimuthDeg: 0 })
    expect(state.Receivers).to.deep.eq(['TRUE'])
  })
})

describe('loadSicdFiles definitions', () => {
  it('lists all enums with their values, type and file', () => {
    const { enums } = load(typesFile, messageFile)

    expect(enums.map(e => e.id)).to.deep.eq(['E_MESSAGE_STATUS', 'E_ELEMENT_STATE', 'E_BOOL'])
    expect(enums[1]).to.deep.eq({
      id: 'E_ELEMENT_STATE',
      name: 'E_ELEMENT_STATE',
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
      ['Element', 'enum', 'E_ELEMENT_STATE'],
      ['Overload', 'enum', 'E_BOOL'],
      ['Title', 'primitive', undefined],
      ['Points', 'struct', 'sPOINT'],
      ['Receivers', 'enum', 'E_BOOL'],
    ])
    expect(state.fields[2]).to.deep.include({ type: 'CH', maxCount: 16, default: 'radar' })
  })

  it('generates a payload template for every struct', () => {
    const point = load(typesFile, messageFile).structs.find(s => s.id === 'sPOINT')!

    expect(JSON.parse(point.payload)).to.deep.eq({ RangeM: 1.5, AzimuthDeg: 0 })
  })

  it('keeps min, max and comments of fields', () => {
    const withRange = {
      ...typesFile,
      content: typesFile.content.replace(
        "RangeM: { Type: 'F4', Default: 1.5 }",
        "RangeM: { Type: 'F4', Default: 1.5, Min: 0, Max: 100000, Comment: 'Radar relative range' }"
      ),
    }
    const point = load(withRange).structs.find(s => s.id === 'sPOINT')!

    expect(point.fields[0]).to.deep.eq({
      name: 'RangeM',
      type: 'F4',
      kind: 'primitive',
      maxCount: undefined,
      min: 0,
      max: 100000,
      default: 1.5,
      comment: 'Radar relative range',
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
      content: "{ Enums: [{ Name: 'E_BOOL', Type: 'U1', Enum: { NO: 0, YES: 1 } }] }",
    }
    const { enums } = load(typesFile, other)

    expect(enums.filter(e => e.name === 'E_BOOL').map(e => e.id)).to.deep.eq([
      'E_BOOL (common_types.json5)',
      'E_BOOL (other_types.json5)',
    ])
    const state = load(typesFile, other).structs.find(s => s.id === 'sSTATE')!
    expect(state.fields[1].ref).to.eq('E_BOOL (common_types.json5)')
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

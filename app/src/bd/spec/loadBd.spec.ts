import { expect } from 'chai'
import 'mocha'
import { loadBdFiles, parseNumber } from '../loadBd'
import { invalidFile, moduleConfigFile, otherFile, parseXml, testFile } from './fixtures'

describe('loadBdFiles', () => {
  const catalog = loadBdFiles([testFile, otherFile, moduleConfigFile, invalidFile], parseXml)
  const message = (file: string, name: string) => catalog.messages.find(m => m.file === file && m.name === name)!

  it('loads the messages of message files and ignores other XML files', () => {
    expect(catalog.files).to.deep.equal(['TST_Msg.xml', 'OTHER_Msg.xml'])
    expect(catalog.ignoredFiles).to.deep.equal(['Interface_Config_TST.xml'])
    expect(catalog.messages.map(m => m.name)).to.deep.equal([
      'TstStatusReq',
      'TstStatusReqRsp',
      'TstRecordData',
      'TstBigEndianCmd',
      'TstBitsUns',
      'TstNumbersUns',
      'TstStatusReq',
      'OtherBrokenUns',
    ])
  })

  it('warns about files that are not valid XML', () => {
    expect(catalog.warnings.some(w => w.startsWith('Broken.xml: is not valid XML'))).to.equal(true)
  })

  it('reads the message attributes, header and payload fields', () => {
    const rsp = message('TST_Msg.xml', 'TstStatusReqRsp')
    expect(rsp.srcNode).to.equal('TST')
    expect(rsp.destNode).to.equal('CTRL')
    expect(rsp.isDatabaseMsg).to.equal(true)
    expect(rsp.bigEndian).to.equal(false)
    expect(rsp.header.map(f => f.name)).to.deep.equal(['MsgLength', 'MsgType', 'MsgStatus', 'ModuleAddress', 'MsgId'])
    expect(rsp.payload.map(f => f.name)).to.deep.equal(['Status', 'State', 'TempDegC', 'Name', 'Points', 'Values'])
    expect(rsp.payload[0]).to.include({
      type: 'E1_TST_STATUS',
      ref: 'TST_Msg.xml:E1_TST_STATUS',
      default: 'TST_FAILED',
      comment: 'Overall status\nTST_PASS = all good',
    })
    expect(rsp.payload[2]).to.include({ min: '-40', max: '125' })
    expect(message('TST_Msg.xml', 'TstBigEndianCmd').bigEndian).to.equal(true)
  })

  it('computes the sizes of header and payload', () => {
    const rsp = message('TST_Msg.xml', 'TstStatusReqRsp')
    expect(rsp.headerSize).to.equal(10)
    // U1 + U2 + I2 + CH[8] + 2 * (F4 + F4) + 3 * U2
    expect(rsp.payloadSize).to.equal(35)
    expect(message('TST_Msg.xml', 'TstStatusReq').payloadSize).to.equal(0)
    // 3 + 3 + 2 bits followed by a byte
    expect(message('TST_Msg.xml', 'TstBitsUns').payloadSize).to.equal(2)
    expect(catalog.structs.get('TST_Msg.xml:sTST_RECORD')!.size).to.equal(17)
  })

  it('identifies messages by their header defaults', () => {
    const rsp = message('TST_Msg.xml', 'TstStatusReqRsp')
    expect(rsp.headerId).to.deep.equal({ moduleAddress: 0x42, msgType: 3, msgId: 0 })
    expect(rsp.lengthField).to.deep.equal({ offset: 0, size: 2 })
    expect(catalog.byHeaderId.get('66/3/0')).to.deep.equal([rsp])
    expect(catalog.headerLayouts).to.have.length(2)
  })

  it('loads enums and structs', () => {
    expect(catalog.enums.get('TST_Msg.xml:E1_TST_STATUS')).to.deep.include({
      name: 'E1_TST_STATUS',
      base: 'U1',
      bits: 8,
      comment: 'TST Status',
      values: [
        { name: 'TST_PASS', value: 0, comment: 'Pass' },
        { name: 'TST_FAILED', value: 1, comment: undefined },
      ],
    })
    expect(catalog.enums.get('TST_Msg.xml:E3b_TST_MODE')).to.deep.include({ base: 'BIT', bits: 3 })
    const record = catalog.structs.get('TST_Msg.xml:sTST_RECORD')!
    expect(record.fields.map(f => [f.name, f.ref])).to.deep.equal([
      ['TimeUs', undefined],
      ['Position', 'TST_Msg.xml:sTST_POINT'],
      ['Status', 'TST_Msg.xml:E1_TST_STATUS'],
    ])
    expect(catalog.structs.get('TST_Msg.xml:sTST_POINT')!.fields[0]).to.include({ units: 'm', min: '0' })
  })

  it('lists the structs of the file as records, structs mentioned in the comment first', () => {
    expect(message('TST_Msg.xml', 'TstRecordData').recordCandidates[0]).to.equal('TST_Msg.xml:sTST_RECORD')
  })

  it('warns about unknown types and leaves the size undefined', () => {
    const broken = message('OTHER_Msg.xml', 'OtherBrokenUns')
    expect(broken.payloadSize).to.equal(undefined)
    expect(catalog.warnings).to.include("OTHER_Msg.xml: OtherBrokenUns.Broken has the unknown type 'sMISSING'")
  })

  it('reads primitive types followed by question marks as the primitive type, with a warning', () => {
    const broken = message('OTHER_Msg.xml', 'OtherBrokenUns')
    expect(broken.payload[1]).to.include({ name: 'Questioned', type: 'U1' })
    expect(catalog.warnings).to.include(
      "OTHER_Msg.xml: OtherBrokenUns.Questioned has the type 'U1??', it is decoded as U1"
    )
  })

  it('warns once about message names defined in several files', () => {
    expect(catalog.byName.get('tststatusreq')).to.have.length(2)
    const warnings = catalog.warnings.filter(w => w.includes('are defined in'))
    expect(warnings).to.deep.equal([
      '1 message name(s) are defined in TST_Msg.xml and OTHER_Msg.xml (TstStatusReq). ' +
        'A topic is decoded with the file whose module matches the topic, otherwise with the first file.',
    ])
  })
})

describe('parseNumber', () => {
  it('parses decimal, hexadecimal, negative and floating point numbers', () => {
    expect(parseNumber('42')).to.equal(42)
    expect(parseNumber('0x1a00')).to.equal(0x1a00)
    expect(parseNumber('-0x10')).to.equal(-16)
    expect(parseNumber('-5')).to.equal(-5)
    expect(parseNumber('1e-06')).to.equal(0.000001)
    expect(parseNumber(' 7 ')).to.equal(7)
  })

  it('returns undefined for anything else', () => {
    expect(parseNumber(undefined)).to.equal(undefined)
    expect(parseNumber('')).to.equal(undefined)
    expect(parseNumber('TST_PASS')).to.equal(undefined)
  })
})

import { expect } from 'chai'
import 'mocha'
import { loadBdFiles } from '../loadBd'
import { decodeBdMessage, findMessageForData, findMessageForTopic } from '../decodeBd'
import { ByteWriter, otherFile, parseXml, testFile } from './fixtures'

describe('decodeBdMessage', () => {
  const catalog = loadBdFiles([testFile, otherFile], parseXml)
  const definition = (name: string) => catalog.messages.find(m => m.name === name && m.file === testFile.name)!
  const decode = (name: string, bytes: Uint8Array) => decodeBdMessage(catalog, definition(name), bytes)

  const statusPayload = () =>
    new ByteWriter().u1(1).u2(0x0100).i2(-12).ch('UNIT1', 8).f4(1.5).f4(90).f4(0.1).f4(180).u2(1).u2(2).u2(3)

  const statusPayloadValue = {
    Status: 'TST_FAILED',
    State: 'TST_SETUP',
    TempDegC: -12,
    Name: 'UNIT1',
    Points: [
      { XM: 1.5, YM: 90 },
      { XM: 0.1, YM: 180 },
    ],
    Values: [1, 2, 3],
  }

  const statusMessage = () => {
    const writer = new ByteWriter().header(3, 0)
    // Append the payload bytes
    const payload = statusPayload().buildWithoutHeader()
    payload.forEach(byte => writer.u1(byte))
    return writer
  }

  it('decodes header and payload, enums by name and strings up to the first NUL', () => {
    const result = decode('TstStatusReqRsp', statusMessage().build())
    expect(result.warnings).to.deep.equal([])
    expect(result.value).to.deep.equal({
      Header: { MsgLength: 43, MsgType: 3, MsgStatus: 0, ModuleAddress: 0x42, MsgId: 0 },
      Payload: statusPayloadValue,
    })
  })

  it('decodes messages published without header', () => {
    const result = decode('TstStatusReqRsp', statusPayload().buildWithoutHeader())
    expect(result.warnings).to.deep.equal([])
    expect(result.value).to.deep.equal({ Payload: statusPayloadValue })
  })

  it('shows what was decoded of a message that ended early', () => {
    const bytes = statusMessage().build().subarray(0, 17)
    const result = decode('TstStatusReqRsp', bytes)
    expect(result.value.Payload).to.deep.equal({ Status: 'TST_FAILED', State: 'TST_SETUP', TempDegC: -12 })
    expect(result.warnings).to.include('The message ended early, it has 17 byte(s) and TstStatusReqRsp needs 45')
  })

  it('warns about a MsgLength not matching the message', () => {
    const result = decode('TstStatusReqRsp', statusMessage().build({ length: 50 }))
    expect(result.value.Payload).to.deep.equal(statusPayloadValue)
    expect(result.warnings).to.deep.equal(['MsgLength is 50 but 43 byte(s) follow it'])
  })

  it('shows the number of unknown enum values', () => {
    const bytes = statusMessage().build()
    bytes[10] = 7
    const result = decode('TstStatusReqRsp', bytes)
    expect((result.value.Payload as any).Status).to.equal(7)
    expect(result.warnings).to.deep.equal(['Payload.Status: 7 is not a value of E1_TST_STATUS'])
  })

  it('decodes the records following a data message', () => {
    const bytes = new ByteWriter()
      .header(4, 1)
      .u4(2)
      .u8(1000n)
      .u8(1001n)
      .f4(10)
      .f4(20)
      .u1(0)
      .u8(1002n)
      .f4(30)
      .f4(40)
      .u1(1)
      .build()
    const result = decode('TstRecordData', bytes)
    expect(result.warnings).to.deep.equal([])
    expect(result.recordStruct).to.equal('sTST_RECORD')
    expect(result.value.Payload).to.deep.equal({ NumberOfRecords: 2, TimestampUs: 1000 })
    expect(result.value.Records).to.deep.equal([
      { TimeUs: 1001, Position: { XM: 10, YM: 20 }, Status: 'TST_PASS' },
      { TimeUs: 1002, Position: { XM: 30, YM: 40 }, Status: 'TST_FAILED' },
    ])
  })

  it('shows bytes following the payload that do not match a struct', () => {
    const bytes = new ByteWriter().header(4, 1).u4(1).u8(1000n).u1(0xab).u1(0x01).u1(0xff).build()
    const result = decode('TstRecordData', bytes)
    expect(result.value.TrailingBytes).to.equal('AB 01 FF')
    expect(result.warnings).to.deep.equal([
      '3 byte(s) follow the payload of TstRecordData and do not match a struct of TST_Msg.xml',
    ])
  })

  it('decodes messages with EndianSwap="Yes" as big endian', () => {
    const bytes = new ByteWriter(false).header(0, 2).u4(0x01020304).build()
    const result = decode('TstBigEndianCmd', bytes)
    expect(result.warnings).to.deep.equal([])
    expect(result.value.Payload).to.deep.equal({ Value: 0x01020304 })
    expect((result.value.Header as any).MsgLength).to.equal(12)
  })

  it('reads BIT fields most significant bit first', () => {
    // A = 0b101, Mode = 0b101 (MODE_B), B = 0b11
    const bytes = new ByteWriter().header(5, 3).u1(0b10110111).u1(9).build()
    const result = decode('TstBitsUns', bytes)
    expect(result.warnings).to.deep.equal([])
    expect(result.value.Payload).to.deep.equal({ A: 5, Mode: 'MODE_B', B: 3, After: 9 })
  })

  it('converts numbers that JSON can not represent', () => {
    const bytes = new ByteWriter()
      .header(5, 4)
      .u8(2n ** 64n - 1n)
      .i8(-5n)
      .f4(0.1)
      .f8(NaN)
      .build()
    const result = decode('TstNumbersUns', bytes)
    expect(result.value.Payload).to.deep.equal({
      Big: '18446744073709551615',
      Signed: -5,
      Float: 0.1,
      Double: 'NaN',
    })
  })

  it('stops at fields with an unknown type', () => {
    const broken = catalog.messages.find(m => m.name === 'OtherBrokenUns')!
    const bytes = new ByteWriter().header(5, 8).u2(7).u1(8).u2(9).build()
    const result = decodeBdMessage(catalog, broken, bytes)
    expect(result.value.Payload).to.deep.equal({ Good: 7, Questioned: 8 })
    expect(result.warnings[0]).to.equal("Payload.Broken: unknown type 'sMISSING', decoding stopped")
  })
})

describe('findMessageForTopic', () => {
  const catalog = loadBdFiles([testFile, otherFile], parseXml)

  it('matches the last topic level with the message name, ignoring case', () => {
    expect(findMessageForTopic(catalog, 'SYS/TST/TstStatusReqRsp')?.name).to.equal('TstStatusReqRsp')
    expect(findMessageForTopic(catalog, 'sys/tst/tststatusreqrsp')?.name).to.equal('TstStatusReqRsp')
    expect(findMessageForTopic(catalog, 'TstStatusReqRsp')?.name).to.equal('TstStatusReqRsp')
    expect(findMessageForTopic(catalog, 'SYS/TST/Unknown')).to.equal(undefined)
  })

  it('uses the module of the topic when several files define the message', () => {
    expect(findMessageForTopic(catalog, 'SYS/OTHER/TstStatusReq')?.file).to.equal('OTHER_Msg.xml')
    expect(findMessageForTopic(catalog, 'SYS/TST/TstStatusReq')?.file).to.equal('TST_Msg.xml')
    expect(findMessageForTopic(catalog, 'SYS/XYZ/TstStatusReq')?.file).to.equal('TST_Msg.xml')
  })
})

describe('findMessageForData', () => {
  const catalog = loadBdFiles([testFile, otherFile], parseXml)

  it('identifies a message by ModuleAddress, MsgType and MsgId', () => {
    const bytes = new ByteWriter().header(4, 1).u4(0).u8(0n).build()
    expect(findMessageForData(catalog, bytes)?.name).to.equal('TstRecordData')
    const bigEndian = new ByteWriter(false).header(0, 2).u4(1).build()
    expect(findMessageForData(catalog, bigEndian)?.name).to.equal('TstBigEndianCmd')
  })

  it('requires MsgLength to match the size of the message', () => {
    const bytes = new ByteWriter().header(4, 1).u4(0).u8(0n).build({ length: 99 })
    expect(findMessageForData(catalog, bytes)).to.equal(undefined)
  })

  it('does not match JSON or short payloads', () => {
    expect(findMessageForData(catalog, new TextEncoder().encode('{"value": 12345}'))).to.equal(undefined)
    expect(findMessageForData(catalog, new Uint8Array([1, 2]))).to.equal(undefined)
  })
})

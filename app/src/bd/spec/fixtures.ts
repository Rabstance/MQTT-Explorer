import { XmlParser } from '../loadBd'
import { BdSourceFile } from '../types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom')

const { DOMParser } = new JSDOM('').window
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)
export const parseXml: XmlParser = text => new DOMParser().parseFromString(text, 'text/xml')

const header = (length: number, type: number, id: string) => `
  <Header>
    <Field Name="MsgLength"     Type="U2" Default="${length}"/>
    <Field Name="MsgType"       Type="U2" Default="${type}"/>
    <Field Name="MsgStatus"     Type="U2"/>
    <Field Name="ModuleAddress" Type="U2" Default="0x0042"/>
    <Field Name="MsgId"         Type="U2" Default="${id}"/>
  </Header>`

export const testFile: BdSourceFile = {
  name: 'TST_Msg.xml',
  // Starts with a byte order mark like many of the SICD files
  content: `${BYTE_ORDER_MARK}<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE MessageFile SYSTEM "MessageFile.DTD">
<MessageFile>
  <Section Name="TST Type Definitions">
    <Typedef Name="E1_TST_STATUS">
      <Comment> TST Status </Comment>
      <Record Name="Status" Type="U1">
        <Enumeration Name="TST_PASS" Value="0x00"><Comment> Pass </Comment></Enumeration>
        <Enumeration Name="TST_FAILED" Value="0x01"/>
      </Record>
    </Typedef>
    <Typedef Name="E2_TST_STATE">
      <Record Name="State" Type="U2">
        <Enumeration Name="TST_OFFLINE" Value="0x0000"/>
        <Enumeration Name="TST_SETUP" Value="0x0100"/>
      </Record>
    </Typedef>
    <Typedef Name="E3b_TST_MODE">
      <Record Name="Mode" Type="BIT" Count="3">
        <Enumeration Name="MODE_A" Value="1"/>
        <Enumeration Name="MODE_B" Value="5"/>
      </Record>
    </Typedef>
    <Typedef Name="sTST_POINT">
      <Comment> A point </Comment>
      <Record Name="XM" Type="F4" Units="m" Min="0" Max="100000"/>
      <Record Name="YM" Type="F4"/>
    </Typedef>
    <Typedef Name="sTST_RECORD">
      <Record Name="TimeUs" Type="U8"/>
      <Record Name="Position" Type="sTST_POINT" UseStruct="yes"/>
      <Record Name="Status" Type="E1_TST_STATUS"/>
    </Typedef>
    <Typedef Name="sTST_OTHER">
      <Record Name="Value" Type="U4"/>
    </Typedef>
  </Section>
  <Section Name="TST MESSAGES">
    <Message Name="TstStatusReq" SrcNode="CTRL" DestNode="TST" EndianSwap="No" ReplyMsg="TstStatusReqRsp">
      <Comment>Msg ID 0x00 - Get Status Request</Comment>
      ${header(8, 2, '0x0000')}
      <Payload><Comment>No Payload</Comment></Payload>
    </Message>
    <Message Name="TstStatusReqRsp" SrcNode="TST" DestNode="CTRL" IsDatabaseMsg="Yes">
      ${header(39, 3, '0x0000')}
      <Payload>
        <Field Name="Status" Type="E1_TST_STATUS" Default="TST_FAILED" UseEnums="Yes">
          <Comment>
            Overall status
            TST_PASS = all good
          </Comment>
        </Field>
        <Field Name="State" Type="E2_TST_STATE" Default="TST_OFFLINE"/>
        <Field Name="TempDegC" Type="I2" Min="-40" Max="125"/>
        <Field Name="Name" Type="CH" Count="8"/>
        <Field Name="Points" Type="sTST_POINT" Count="2"/>
        <Field Name="Values" Type="U2" Count="3"/>
      </Payload>
    </Message>
    <Message Name="TstRecordData" SrcNode="TST" DestNode="SINK">
      <Comment>Followed by NumberOfRecords sTST_RECORD structs</Comment>
      ${header(20, 4, '0x01')}
      <Payload>
        <Field Name="NumberOfRecords" Type="U4"/>
        <Field Name="TimestampUs" Type="U8"/>
      </Payload>
    </Message>
    <Message Name="TstBigEndianCmd" SrcNode="CTRL" DestNode="TST" EndianSwap="Yes">
      ${header(12, 0, '0x02')}
      <Payload>
        <Field Name="Value" Type="U4"/>
      </Payload>
    </Message>
    <Message Name="TstBitsUns" SrcNode="TST" DestNode="CTRL">
      ${header(11, 5, '0x03')}
      <Payload>
        <Field Name="A" Type="BIT" Count="3"/>
        <Field Name="Mode" Type="E3b_TST_MODE"/>
        <Field Name="B" Type="BIT" Count="2"/>
        <Field Name="After" Type="U1"/>
      </Payload>
    </Message>
    <Message Name="TstNumbersUns" SrcNode="TST" DestNode="CTRL">
      ${header(28, 5, '0x04')}
      <Payload>
        <Field Name="Big" Type="U8"/>
        <Field Name="Signed" Type="I8"/>
        <Field Name="Float" Type="F4"/>
        <Field Name="Double" Type="F8"/>
      </Payload>
    </Message>
  </Section>
</MessageFile>
`,
}

export const otherFile: BdSourceFile = {
  name: 'OTHER_Msg.xml',
  content: `<?xml version="1.0" encoding="UTF-8"?>
<MessageFile>
  <Section Name="OTHER MESSAGES">
    <Message Name="TstStatusReq" SrcNode="CTRL" DestNode="OTHER">
      ${header(8, 2, '0x0007')}
      <Payload><Comment>No Payload</Comment></Payload>
    </Message>
    <Message Name="OtherBrokenUns" SrcNode="OTHER" DestNode="CTRL">
      ${header(10, 5, '0x0008')}
      <Payload>
        <Field Name="Good" Type="U2"/>
        <Field Name="Questioned" Type="U1??"/>
        <Field Name="Broken" Type="sMISSING"/>
      </Payload>
    </Message>
  </Section>
</MessageFile>
`,
}

export const moduleConfigFile: BdSourceFile = {
  name: 'Interface_Config_TST.xml',
  content: `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE Module [
  <!ENTITY % Module SYSTEM "interface_schema.dtd">
  %Module;
  ]>
<Module Name="TST" System="SYS"><Publish/></Module>`,
}

export const invalidFile: BdSourceFile = {
  name: 'Broken.xml',
  content: `<MessageFile><Section Name="x"></MessageFile>`,
}

/**
 * Builds binary messages, little endian unless configured otherwise
 */
export class ByteWriter {
  private bytes: Array<number> = []

  constructor(private littleEndian = true) {}

  private write(size: number, set: (view: DataView) => void) {
    const view = new DataView(new ArrayBuffer(size))
    set(view)
    this.bytes.push(...Array.from(new Uint8Array(view.buffer)))
    return this
  }

  public u1(value: number) {
    return this.write(1, view => view.setUint8(0, value))
  }

  public u2(value: number) {
    return this.write(2, view => view.setUint16(0, value, this.littleEndian))
  }

  public i2(value: number) {
    return this.write(2, view => view.setInt16(0, value, this.littleEndian))
  }

  public u4(value: number) {
    return this.write(4, view => view.setUint32(0, value, this.littleEndian))
  }

  public u8(value: bigint) {
    return this.write(8, view => view.setBigUint64(0, value, this.littleEndian))
  }

  public i8(value: bigint) {
    return this.write(8, view => view.setBigInt64(0, value, this.littleEndian))
  }

  public f4(value: number) {
    return this.write(4, view => view.setFloat32(0, value, this.littleEndian))
  }

  public f8(value: number) {
    return this.write(8, view => view.setFloat64(0, value, this.littleEndian))
  }

  public ch(text: string, length: number) {
    for (let index = 0; index < length; index += 1) {
      this.bytes.push(index < text.length ? text.charCodeAt(index) : 0)
    }
    return this
  }

  /** Standard 10 byte header, MsgLength is set when the message is built */
  public header(type: number, id: number, moduleAddress = 0x42) {
    return this.u2(0).u2(type).u2(0).u2(moduleAddress).u2(id)
  }

  public build(options: { length?: number } = {}) {
    const bytes = new Uint8Array(this.bytes)
    const length = options.length ?? bytes.length - 2
    new DataView(bytes.buffer).setUint16(0, length, this.littleEndian)
    return bytes
  }

  public buildWithoutHeader() {
    return new Uint8Array(this.bytes)
  }
}

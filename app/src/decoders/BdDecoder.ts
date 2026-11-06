import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { Decoder } from '../../../backend/src/Model/Decoder'
import { decodeBdMessage, findMessageForData, findMessageForTopic } from '../bd/decodeBd'
import { BdCatalog } from '../bd/types'
import { decodersChanged } from './decodersChanged'
import { MessageDecoder } from './MessageDecoder'

let catalog: BdCatalog | undefined
let enabled = false

/**
 * Sets the message definitions of the BD tab and whether binary messages are decoded automatically.
 * When disabled, the decoder can still be chosen for a topic by hand.
 */
export function configureBdDecoder(newCatalog: BdCatalog | undefined, newEnabled: boolean) {
  if (newCatalog === catalog && newEnabled === enabled) {
    return
  }
  catalog = newCatalog
  enabled = newEnabled
  decodersChanged.dispatch()
}

function bytesOf(input: Base64Message) {
  const buffer = input.toBuffer()
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

/**
 * Decodes binary messages with the XML SICD definitions loaded in the BD tab.
 * The message is found by the last topic level (the message name) or by its header.
 */
export const BdDecoder: MessageDecoder = {
  formats: ['SICD BD'],
  canDecodeTopic(topic: string) {
    return Boolean(enabled && catalog && findMessageForTopic(catalog, topic))
  },
  canDecodeData(data: Base64Message) {
    return Boolean(enabled && catalog && findMessageForData(catalog, bytesOf(data)))
  },
  decode(input, _format, topic) {
    if (!catalog) {
      return { error: 'No BD SICD folder is loaded, choose one in the BD tab', decoder: Decoder.NONE }
    }
    const bytes = bytesOf(input)
    const definition = (topic && findMessageForTopic(catalog, topic)) || findMessageForData(catalog, bytes)
    if (!definition) {
      return { error: 'No SICD message matches the topic or the message header', decoder: Decoder.NONE }
    }

    const result = decodeBdMessage(catalog, definition, bytes)
    const records = result.recordStruct ? `, records ${result.recordStruct}` : ''
    return {
      message: Base64Message.fromString(JSON.stringify(result.value)),
      decoder: Decoder.SICD_BD,
      description: `Decoded ${definition.name} (${definition.file}${records})`,
      warnings: result.warnings,
    }
  },
}

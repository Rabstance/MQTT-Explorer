import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { Decoder } from '../../../backend/src/Model/Decoder'

export interface DecoderEnvelope {
  message?: Base64Message
  error?: string
  decoder: Decoder
  /** Shown above the decoded value, e.g. the message definition that was used */
  description?: string
  /** Problems found while decoding, the message may still be decoded partially */
  warnings?: Array<string>
}

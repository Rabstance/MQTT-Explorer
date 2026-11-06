import { EventDispatcher } from '../../../events'

/**
 * Dispatched when the topics a decoder can decode or its results change,
 * e.g. when the SICD BD folder is loaded or decoding is switched on or off.
 * Topics re-evaluate their decoder, decoders chosen by the user are kept.
 */
export const decodersChanged = new EventDispatcher<void>()

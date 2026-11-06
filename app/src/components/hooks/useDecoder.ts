import { useCallback, useEffect, useState } from 'react'
import { Decoder } from '../../../../backend/src/Model/Decoder'
import * as q from '../../../../backend/src/Model'
import { TopicViewModel } from '../../model/TopicViewModel'
import { useSubscription } from './useSubscription'
import { useViewModel } from '../Tree/TreeNode/effects/useViewModel'
import { DecoderEnvelope } from '../../decoders/DecoderEnvelope'
import { decodersChanged } from '../../decoders'

export type DecoderFunction = (message: q.Message) => DecoderEnvelope | undefined

/**
 * Provides the latest decoder for a topic
 *
 * @param treeNode
 * @returns
 */
export function useDecoder(treeNode: q.TreeNode<TopicViewModel> | undefined): DecoderFunction {
  const viewModel = useViewModel(treeNode)
  const [decoder, setDecoder] = useState(viewModel?.decoder)

  useSubscription(viewModel?.onDecoderChange, setDecoder)

  // The view model is created after the first render, and decoders recognizing the data
  // can only be found once a message arrived
  const message = treeNode?.message
  useEffect(() => {
    setDecoder(treeNode?.viewModel?.decoder)
  }, [treeNode, message])

  const refreshDecoder = useCallback(() => viewModel?.refreshDecoder(), [viewModel])
  useSubscription(decodersChanged, refreshDecoder)

  const topic = treeNode?.path()
  return useCallback(
    message =>
      decoder && message.payload
        ? decoder.decoder.decode(message.payload, decoder.format, topic)
        : { message: message.payload ?? undefined, decoder: Decoder.NONE },
    [decoder, topic]
  )
}

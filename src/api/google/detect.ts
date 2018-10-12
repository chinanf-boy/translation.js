import { StringOrTranslateOptions } from '../types'
import { getRoot } from './state'

import request from '../../utils/make-request'
import getError, { ERROR_CODE } from '../../utils/error'

interface DetectResult {
  src?: string
}

export default async function(options: StringOrTranslateOptions) {
  const { text, com = false, timeout = 5000 } =
    typeof options === 'string' ? { text: options } : options

  // https://translate.google.cn/translate_a/single?client=gtx&sl=auto&dj=1&ie=UTF-8&oe=UTF-8&q=test
  const { src } = (await request({
    url: getRoot(com) + '/translate_a/single',
    query: {
      client: 'gtx',
      sl: 'auto',
      dj: '1',
      ie: 'UTF-8',
      oe: 'UTF-8',
      q: text
    },
    timeout
  })) as DetectResult

  if (src) return src
  throw getError(ERROR_CODE.UNSUPPORTED_LANG)
}

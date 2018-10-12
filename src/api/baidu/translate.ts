import { StringOrTranslateOptions, TranslateResult } from '../types'
import { standard2custom, root, Cookie, custom2standard } from './state'
import getValue from '../../utils/get'
import request from '../../utils/make-request'
import sign from './sign'
import getError, { ERROR_CODE } from '../../utils/error'
import { getAudioURI } from './audio'
import detect from './detect'
import { StringObject } from '../../types'

const headers: StringObject = IS_NODE
  ? {
      'X-Requested-With': 'XMLHttpRequest',
      Cookie
    }
  : {
      'X-Requested-With': 'XMLHttpRequest'
    }

export default async function(options: StringOrTranslateOptions) {
  let { from = undefined, to = undefined, text, timeout = 5000 } =
    typeof options === 'string' ? { text: options } : options

  if (!from) {
    from = await detect(text)
  }

  if (!to) {
    to = from.startsWith('zh') ? 'en' : 'zh-CN'
  }

  const customFromLang = standard2custom[from]
  const customToLang = standard2custom[to]

  if (!customFromLang || !customToLang) {
    throw getError(ERROR_CODE.UNSUPPORTED_LANG)
  }

  return transformRaw(
    text,
    await request({
      url: root + '/v2transapi',
      type: 'form',
      method: 'post',
      body: Object.assign(
        {
          from: customFromLang,
          to: customToLang,
          query: text,
          transtype: 'translang',
          simple_means_flag: 3
        },
        await sign(text)
      ),
      headers,
      timeout
    })
  )
}

interface ResponseSymbol {
  parts: {
    part: string // 单词属性，例如 'n.'、'vi.' 等
    means: string[] // 此单词属性下单词的释义
  }[]
  ph_am: string // 美国音标
  ph_en: string // 英国音标
}

interface Response {
  error?: number // 查询失败时会有这个属性。997 表示 token 有误，此时应该获取 BAIDUID 后重试
  dict_result: {
    // 针对英语单词会提供词典数据。若当前翻译没有词典数据，则这个属性是一个空数组
    simple_means?: {
      symbols: [ResponseSymbol] // 虽然这是一个数组，但是它一直都只有一个元素

      exchange: {
        // 单词的其他变形
        word_done: '' | string[] // 过去分词
        word_er: '' | string[]
        word_est: '' | string[]
        word_ing: '' | string[] // 现在分词
        word_past: '' | string[] // 过去式
        word_pl: '' | string[] // 复数
        word_proto?: string[] // 词根，偶尔没有
        word_third: '' | string[] // 第三人称单数
      }
    }
  }

  trans_result: {
    data: {
      src: string
      dst: string
    }[]
    from: string
    to: string
  }
}

function transformRaw(text: string, body: Response) {
  const transResult = body.trans_result
  const customFrom = getValue(transResult, 'from')
  const customTo = getValue(transResult, 'to')

  const result: TranslateResult = {
    text,
    raw: body,
    link: root + `/#${customFrom}/${customTo}/${encodeURIComponent(text)}`,
    from: custom2standard[customFrom],
    to: custom2standard[customTo]
  }

  const symbols: ResponseSymbol = getValue(body, [
    'dict_result',
    'simple_means',
    'symbols',
    '0'
  ])

  if (symbols) {
    // 解析音标
    const phonetic = []
    const { ph_am, ph_en } = symbols
    if (ph_am) {
      phonetic.push({
        name: '美',
        ttsURI: getAudioURI(text, 'en'),
        value: ph_am
      })
    }
    if (ph_en) {
      phonetic.push({
        name: '英',
        ttsURI: getAudioURI(text, 'en-GB'),
        value: ph_en
      })
    }
    if (phonetic.length) {
      result.phonetic = phonetic
    }

    // 解析词典数据
    try {
      result.dict = symbols.parts.map(part => {
        return part.part + ' ' + part.means.join('；')
      })
    } catch (e) {}
  }

  // 解析普通的翻译结果
  try {
    result.result = transResult.data.map(d => d.dst)
  } catch (e) {}

  if (!result.dict && !result.result) {
    throw getError(ERROR_CODE.API_SERVER_ERROR)
  }

  return result
}

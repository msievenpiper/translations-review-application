import * as cheerio from 'cheerio'

export interface ExtractedText {
  navigation: string[]
  headings: string[]
  body: string[]
  ctaButtons: string[]
  allText: string
}

export function extractTextFromHtml(html: string): ExtractedText {
  const $ = cheerio.load(html)

  // Remove noise
  $('script, style, noscript, svg, img').remove()

  const navigation: string[] = []
  const headings: string[] = []
  const body: string[] = []
  const ctaButtons: string[] = []

  $('nav a, header a').each((_, el) => {
    const text = $(el).text().trim()
    if (text) navigation.push(text)
  })

  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const text = $(el).text().trim()
    if (text) headings.push(text)
  })

  $('button, [role="button"], input[type="submit"], a.btn, a.button').each((_, el) => {
    const text = ($(el).text() || ($(el).attr('value') as string) || '').trim()
    if (text) ctaButtons.push(text)
  })

  $('p, li, td, th, label, span, div').each((_, el) => {
    const children = $(el).children()
    if (children.length === 0) {
      const text = $(el).text().trim()
      if (text && text.length > 2) body.push(text)
    }
  })

  const allText = [...navigation, ...headings, ...body, ...ctaButtons]
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('\n')

  return { navigation, headings, body, ctaButtons, allText }
}

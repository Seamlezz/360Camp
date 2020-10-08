import * as puppeteer from 'puppeteer'
import { readMatches } from './gather'

require('dotenv').config()

export const INTEL_EMAIL = process.env.INTEL_EMAIL
export const INTEL_PASS = process.env.INTEL_PASS

if (INTEL_EMAIL === undefined || INTEL_PASS === undefined) {
  throw new Error('The envirorment variables where not configured correctly')
}

let browser: puppeteer.Browser

console.log('test')

readMatches()

export async function getPage() {
  if (browser === undefined || !browser.isConnected()) {
    console.log('created a new browser')
    browser = await puppeteer.launch({ headless: false })
  }

  const page = await browser.newPage()
  await page.setViewport({ width: 1200, height: 720 })

  return page
}

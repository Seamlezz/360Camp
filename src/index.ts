import * as puppeteer from 'puppeteer'
import {readMatches} from './gather'
import {login, planRecording} from "./plan";
import pLimit = require("p-limit");

require('dotenv').config()

export const INTEL_EMAIL = process.env.INTEL_EMAIL
export const INTEL_PASS = process.env.INTEL_PASS

if (INTEL_EMAIL === undefined || INTEL_PASS === undefined) {
    throw new Error('The envirorment variables where not configured correctly')
}

let browser: puppeteer.Browser

export async function getPage() {
    const page = await browser.newPage()
    await page.setViewport({width: 1200, height: 720})

    return page
}

async function init() {
    browser = await puppeteer.launch({headless: false});
    const data = await readMatches();

    console.table(data)

    const loginPage = await getPage();
    await loginPage.goto('https://app.360sportsintelligence.com', {
        waitUntil: 'networkidle0',
    })
    await login(loginPage);
    await loginPage.close();

    const limit = pLimit(4);
    await Promise.all(data.map((d) => limit(() => planRecording(d))))

    // await planRecording(data[0])

    await browser.close();
}

init().catch(err => console.error(err));

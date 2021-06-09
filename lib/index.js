"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPage = exports.INTEL_PASS = exports.INTEL_EMAIL = void 0;
const puppeteer = require("puppeteer");
const gather_1 = require("./gather");
const plan_1 = require("./plan");
const pLimit = require("p-limit");
require('dotenv').config();
exports.INTEL_EMAIL = process.env.INTEL_EMAIL;
exports.INTEL_PASS = process.env.INTEL_PASS;
if (exports.INTEL_EMAIL === undefined || exports.INTEL_PASS === undefined) {
    throw new Error('The envirorment variables where not configured correctly');
}
let browser;
async function getPage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 720 });
    return page;
}
exports.getPage = getPage;
async function init() {
    browser = await puppeteer.launch({ headless: false });
    const data = await gather_1.readMatches();
    console.table(data);
    const loginPage = await getPage();
    await loginPage.goto('https://app.360sportsintelligence.com', {
        waitUntil: 'networkidle0',
    });
    await plan_1.login(loginPage);
    await loginPage.close();
    const limit = pLimit(4);
    await Promise.all(data.map((d) => limit(() => plan_1.planRecording(d))));
    // await planRecording(data[0])
    await browser.close();
}
init().catch(err => console.error(err));
//# sourceMappingURL=index.js.map
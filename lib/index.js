"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPage = exports.INTEL_PASS = exports.INTEL_EMAIL = void 0;
const puppeteer = require("puppeteer");
const gather_1 = require("./gather");
require('dotenv').config();
exports.INTEL_EMAIL = process.env.INTEL_EMAIL;
exports.INTEL_PASS = process.env.INTEL_PASS;
if (exports.INTEL_EMAIL === undefined || exports.INTEL_PASS === undefined) {
    throw new Error('The envirorment variables where not configured correctly');
}
let browser;
console.log('test');
gather_1.readMatches();
async function getPage() {
    if (browser === undefined || !browser.isConnected()) {
        console.log('created a new browser');
        browser = await puppeteer.launch({ headless: false });
    }
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 720 });
    return page;
}
exports.getPage = getPage;
//# sourceMappingURL=index.js.map
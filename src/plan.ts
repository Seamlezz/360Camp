import * as puppeteer from 'puppeteer'
import {getPage, INTEL_EMAIL, INTEL_PASS} from '.'

export const planRecording = async (data: any) => {
    const page = await getPage()

    await page.goto('https://app.360sportsintelligence.com', {
        waitUntil: 'networkidle2',
    })

    await page.waitForSelector('a[title="recording"]')

    await createEvent(page, data)
    await addTeam(page, data)

    await page.close()
}

export async function login(page: puppeteer.Page) {
    await page.type('input[type=email]', INTEL_EMAIL!)
    await page.type('input[type=password]', INTEL_PASS!.replace(/\\/g, ''))

    await Promise.all([
        page.click('input[type=submit]'),
        page.waitForNavigation({waitUntil: 'networkidle2'}),
    ])
}

async function createEvent(page: puppeteer.Page, data: any) {
    await page.click('a[title="recording"]')
    await page.click('a[alt="Add a new recording"]')

    await page.type('#title', `${data.team} - ${data.guestClub} ${data.guestTeam}`)
    await page.select('#duration', `${data.duration}`)
    const selectElem = await page.$('#recording_setup_id')
    if (selectElem !== null) await selectElem.type(`SV Phoenix ${data.field}`)
    try {
        await page.select('#guest_club', `${data.guestClub}`)
    } catch (error) {
        console.error(error)
    }

    const [liveCheck] = await page.$x(`//span[contains(text(),'Start livestream during recording')]`)

    if (liveCheck) {
        await liveCheck.click()
    }

    await page.click('a[alt="More options"]')
    await page.type('#start_date', `${data.startDate}`)
    await page.type('#start_time', `${data.startTime}`)

    const [button] = await page.$x("//span[contains(text(), 'Plan recording')]")
    if (button) {
        await Promise.all([button.click(), page.waitForSelector('a[alt="Return"]')])
    }
}

async function addTeam(page: puppeteer.Page, data: any) {
    const {team, guestClub, guestTeam} = data

    await page.click(`div[alt="Edit ${team} - ${guestClub} ${guestTeam}"]`)

    const [label] = await page.$x(
        `//span[contains(text(),'${team}')]/ancestor::div[contains(@class, 'panel-list')]/ancestor::div[@id='view-recording-tab']`,
    )

    if (!label) {
        await page.type('input[name="query-teams"]', `${team}`)
        await page.click(`#query-teams-${team.toLowerCase()}`)
        await page.waitForXPath(
            `//span[contains(text(),'${team}')]/ancestor::div[contains(@class, 'panel-list')]/ancestor::div[@id='view-recording-tab']`,
        )
    }
}

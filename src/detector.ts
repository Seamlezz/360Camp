import { ElementHandle, Page } from "puppeteer";
import { FilteredMatch, State } from "./filter";
import { Match } from "./gather";

export type DetectedMatch = {
    state: DetectedState;
} & Match;

export type Recording = {
    startDate: Date;
    endDate: Date;
    field: number;
}

export type DetectedState = State | "duplicate";


export async function detectDuplicates(matches: FilteredMatch[], page: Page): Promise<DetectedMatch[]> {
    const usfullMatches = matches.filter(match => match.state === "run")
    const dates = detectDates(usfullMatches)

    const planned = await findPlannedRecordings(dates, page)
    const recordings = await checkAllTimeings(planned, page)

    return matches.map(match => {
        if (match.state === 'ignore') return match
        const duration = match.duration
        const startDate = new Date(`${match.startDate} ${match.startTime}`)
        const endDate = new Date(startDate.getTime() + duration * 1000)
        // Check if any of the recordings is in the same field and has intercecting dates
        for (const recording of recordings) {
            if (match.field !== recording.field) continue;

            console.log(`Matching ${match.team} -`, startDate, endDate, recording.startDate, recording.endDate, startDate.getTime() >= recording.startDate.getTime() && startDate.getTime() <= recording.endDate.getTime(), recording.startDate.getTime() >= startDate.getTime() && recording.startDate.getTime() <= endDate.getTime())

            // Check if the start date of the match is between the start and end date of the recording
            if (startDate.getTime() >= recording.startDate.getTime() && startDate.getTime() <= recording.endDate.getTime()) {
                return {
                    ...match,
                    state: "duplicate"
                }
            }
            // Check if the start date of the recording is between the start and end date of the match
            if (recording.startDate.getTime() >= startDate.getTime() && recording.startDate.getTime() <= endDate.getTime()) {
                return {
                    ...match,
                    state: "duplicate"
                }
            }
        }
        return match
    })
}

// Get all the dates from all the matches filtering out the duplicates
// The result should be an array of dates strings
function detectDates(matches: FilteredMatch[]) {
    const dates = matches.map(match => getDate(match))

    return dates.filter(date => dates.indexOf(date) === dates.lastIndexOf(date))
}

// Get the date from the match
// The matchs has a startDate which has the format "YYYY-MM-DD"
// The result sould be "Mon D"
// Example : "2018-01-01" -> "Jan 1"
// Example : "2020-08-22" -> "Aug 22"
function getDate(match: FilteredMatch) {
    const startDate = match.startDate.split("-")
    const day = startDate[2]
    const month = startDate[1]

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    return months[parseInt(month) - 1] + " " + day
}

// Search on the page for all recordings with a date
async function findPlannedRecordings(dates: string[], page: Page): Promise<ElementHandle[]> {
    const elements = await Promise.all(dates.map(date => {
        return page.$x(`//div[contains(@class, "recording")]//div[contains(@class, "date")]//span[contains(@class, "month") and text()="${date.split(" ")[0]}"]/../span[contains(@class, "day") and text()="${date.split(" ")[1]}"]//ancestor::div[contains(@class, "recording")]`)
    }))

    return elements.flat()
}

async function checkAllTimeings(panned: ElementHandle<Element>[], page: Page): Promise<Recording[]> {
    const recordings = []
    for (const planning of panned) {
        recordings.push(await checkTimeing(planning, page))
    }
    return recordings
}

async function checkTimeing(recording: ElementHandle<Element>, page: Page): Promise<Recording> {
    console.log("Checking: ", (await recording.getProperty("textContent"))?.jsonValue<string>())

    const field = await getField(recording)

    // Get a child of the recording with the class "ic-edit". Then click this child
    const edit = await recording.$x(`//div[contains(@class, "ic-edit")]`)
    // Check if the child exists
    if (edit.length === 0) {
        throw new Error("Could not find the edit button")
    }
    await edit[0].click()

    // Get the ancestor of the edit button with the class "recording". Then print the textContent of this element
    

    // Search on the page for the first element with the class "pane-content"
    // Then get the first child of this element with the class "details"
    // Then concatinate the text of all the children of this element

    const details = await page.$x(`//div[contains(@class, "pane-content")]//div[contains(@class, "details")]`)
    if (details.length === 0) {
        throw new Error("Could not find the details")
    }
    const text = await details[0].getProperty("textContent")
    if (!text) {
        throw new Error("Could not get the textContent")
    }

    const textContent = (await text.jsonValue<string>()).replace("th", " ")
    const { startDate, endDate } = parseDates(textContent)

    return {
        startDate,
        endDate,
        field: field
    }
}

async function getField(recording: ElementHandle<Element>): Promise<number> {
    // Get a child of the recording with the class "teams" the get the first child with the class "inner" then get the first span child of this child
    const field = await recording.$x(`//div[contains(@class, "teams")]//div[contains(@class, "inner")]//span`)
    // Check if the child exists
    if (field.length !== 0) {
        // Get the text of this field as a string
        const fieldText = await field[0].getProperty("textContent")
        if (fieldText) {
            const text = await fieldText.jsonValue<string>()
            // Get the last number in the text
            const number = text.match(/\d+/g)
            if (number) {
                return parseInt(number[number.length - 1])
            }
        }
    }
    return -1
}

function parseDates(textContent: string) {
    // Transform the textContent into an start and end date
    // Example : "Sunday August 29 12:05 - 14:25" -> "2021-08-29 12:05" and "2021-08-29 14:25"
    // Example : "Friday August 27 19:30 - 21:00" -> "2021-08-27 19:30" and "2021-08-27 21:00"
    const split = textContent.split(" ")
    const day = split.slice(1, 3).join(" ")
    const startTime = split.slice(3, 4).join(" ")
    const endTime = split.slice(5, 6).join(" ")

    // Parse the day to a date
    // Example Sunday August 29th -> 2021-08-29
    const date = new Date(day)
    const year = new Date().getFullYear()
    const month = date.getMonth() + 1
    const dayOfMonth = date.getDate()

    // Parse the time to a date
    // Example 12:05 -> 2021-08-29 12:05
    // Example 14:25 -> 2021-08-29 14:25
    const startDate = new Date(`${year}-${month}-${dayOfMonth} ${startTime}`)
    const endDate = new Date(`${year}-${month}-${dayOfMonth} ${endTime}`)

    return { startDate, endDate }
}
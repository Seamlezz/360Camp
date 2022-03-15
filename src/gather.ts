import * as puppeteer from 'puppeteer';
import * as similarity from 'string-similarity';
import * as uuid from 'uuid';
import {getPage} from '.';
import {clubs} from './clubs';

export type Match = {
    id: string,
    team: string;
    duration: number;
    field: number;
    guestClub: string;
    guestTeam: string;
    startDate: string;
    startTime: string;
    oldRow: string;
}

export const readMatches = async () => {
    const matches = await Promise.all(
        [
            getNextDayOfWeek(new Date(), 6),
            getNextDayOfWeek(new Date(), 7),
        ].map((d) => gatherData(d)),
    )
    return matches.reduce((acc, m) => acc.concat(m), []);
}

async function gatherData(startDate: string): Promise<Match[]> {
    const page = await getPage()

    const url = `https://www.phoenixhockey.nl/site/default.asp?org=100&option=100&SB_DatumWedstrijd=${startDate}`
    console.log("Checking url:", url)
    await page.goto(
        url,
        {
            waitUntil: 'domcontentloaded',
        },
    )

    const lines = await page.$x(
        '//*[contains(text(), "1 Rabobank veld") or contains(text(), "2 Broekhuis veld")]/ancestor::tr[contains(@class, "even_wedstrijden") or contains(@class, "odd_wedstrijden")]',
    )

    // const filteredLines = await filterAsync(lines, async (e) => {
    //     const line = await e.evaluate((element) => {
    //         return element.querySelectorAll('td')[2].innerHTML
    //     })
    //     return !line.includes("Reservering")
    // })

    const data = await Promise.all(lines.map(e => mapRow(e, startDate)))

    await page.close()

    return data
}

async function mapRow(
    line: puppeteer.ElementHandle,
    startDate: string,
): Promise<Match> {
    const [team, guestClub, isField1, startTime] = await Promise.all([
        line.evaluate((element) => {
            return element.querySelectorAll('td')[0].children[0].children[0].innerHTML
        }),
        line.evaluate((element) => {
            return element.querySelectorAll('td')[2].innerHTML
        }),
        line.evaluate((element) =>
            element.innerHTML.includes('1 Rabobank veld'),
        ),
        line.evaluate((element) => {
            return element.querySelectorAll('td')[5].innerHTML
        })
    ])

    const guestInfo = getGuestClub(guestClub)

    return {
        id: uuid.v4(),
        team: getTeamName(team),
        duration: 100 * 60,
        field: isField1 ? 1 : 2,
        guestClub: guestInfo.guestClub,
        guestTeam: guestInfo.guestTeam,
        startDate: startDate,
        startTime: startTime,
        oldRow: `${team} - ${guestClub}`
    }
}

function getTeamName(team: string) {
    const lastIndex = team.lastIndexOf(' ')
    const teamId = team.substring(lastIndex).trim()
    const teamName = team.substring(0, lastIndex)

    if (teamName === 'Veterinnen') return `D30${teamId}`
    if (teamName === 'Veteranen') {
        if (teamId.length === 1) return `H35${teamId}`
        else return `H${teamId}`
    }

    const teamConsonants = teamName
        .replace('Senioren', '')
        .replace(/\B[a-z]/g, '')
        .replace(/ /g, '')

    return `${teamConsonants}${teamId}`.toUpperCase()
}

export function getGuestClub(club: string) {
    let guestClub = club
        .replace("Meisjes ", "M")
        .replace("Jongens ", "J")
        .replace('Senioren ', '')
        .replace("Dames ", "D")
        .replace("Heren ", "H")
        .replace("Jong ", "J")
        .replace("Veterinnen ", "D30")
        .replace("Veteranen ", "H35")
        .replace(/(H\d{2})(\d{2}[A-Z])/g, "H$2")
    const lastIndex = guestClub.lastIndexOf(' ')
    const guestTeam = guestClub.substring(lastIndex).trim()
    guestClub = guestClub.substring(0, lastIndex)

    guestClub = guestClub
        .replace(/[.]/g, '')
        .replace(/( De )/g, '')
        .replace('Mixed', '')
        .replace('Club', '')
        .replace('Hockey', '')
        .replace('Vereniging', '')
        .replace(/(&amp;)/g, '')
        .replace(/(\w*)(se )/g, '$1')
        .replace('!Oefenwedstrijd', '')
        .trim()

    if (guestClub.trim().length === 0) guestClub = "Phoenix";

    guestClub = similarity.findBestMatch(guestClub, clubs).bestMatch.target

    return {
        guestClub: guestClub,
        guestTeam: guestTeam,
    }
}

function getNextDayOfWeek(date: Date, dayOfWeek: number) {
    const resultDate = new Date(date.getTime());

    resultDate.setDate(date.getDate() + ((7 + dayOfWeek - date.getDay()) % 7))

    return resultDate.toISOString().split('T')[0]
}

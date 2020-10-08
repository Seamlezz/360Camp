"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMatches = void 0;
const similarity = require("string-similarity");
const _1 = require(".");
const clubs_1 = require("./clubs");
const plan_1 = require("./plan");
exports.readMatches = async () => {
    const matches = await Promise.all([
        getNextDayOfWeek(new Date(), 6),
        getNextDayOfWeek(new Date(), 7),
    ].map((d) => gatherData(d)));
    const data = matches.reduce((acc, m) => acc.concat(m), []);
    await Promise.all(data.map((d) => plan_1.planRecording(d)));
};
async function gatherData(startDate) {
    const page = await _1.getPage();
    await page.goto(`https://www.phoenixhockey.nl/site/default.asp?org=100&option=100&SB_DatumWedstrijd=${startDate}`, {
        waitUntil: 'networkidle0',
    });
    const lines = await page.$x('//*[contains(text(), "1 Rabobank veld") or contains(text(), "2 Muntstad veld")]/ancestor::tr[contains(@class, "even_wedstrijden") or contains(@class, "odd_wedstrijden")]');
    const data = await Promise.all(lines.map((e) => mapRow(e, startDate)));
    await page.close();
    return data;
}
async function mapRow(line, startDate) {
    const team = await line.evaluate((element) => {
        return element.querySelectorAll('td')[0].children[0].children[0].innerHTML;
    });
    const guestClub = await line.evaluate((element) => {
        return element.querySelectorAll('td')[2].innerHTML;
    });
    const isField1 = await line.evaluate((element) => element.innerHTML.includes('1 Rabobank veld'));
    const startTime = await line.evaluate((element) => {
        return element.querySelectorAll('td')[5].innerHTML;
    });
    return {
        team: getTeamName(team),
        duration: 5400,
        field: isField1 ? 1 : 2,
        guestClub: getGuestClub(guestClub),
        startDate: startDate,
        startTime: startTime,
    };
}
function getTeamName(team) {
    const lastIndex = team.lastIndexOf(' ');
    const teamId = team.substring(lastIndex).trim();
    const teamName = team.substring(0, lastIndex);
    if (teamName === 'Veterinnen')
        return `D30${teamId}`;
    if (teamName === 'Veteranen') {
        if (teamId.length === 1)
            return `H35${teamId}`;
        else
            return `H${teamId}`;
    }
    const teamConsonants = teamName
        .replace('Senioren', '')
        .replace(/\B[a-z]/g, '')
        .replace(/ /g, '');
    return `${teamConsonants}${teamId}`;
}
function getGuestClub(club) {
    let guestClub = club;
    const lastIndex = guestClub.lastIndexOf(' ');
    guestClub = guestClub.substring(0, lastIndex);
    guestClub = guestClub
        .replace(/[.]/g, '')
        .replace(/( De )/g, '')
        .replace('Mixed', '')
        .replace('Club', '')
        .replace('Hockey', '')
        .replace('Vereniging', '')
        .replace(/(\&amp\;)/g, '')
        .replace(/(\w*)(se )/g, '$1')
        .trim();
    guestClub = similarity.findBestMatch(guestClub, clubs_1.clubs).bestMatch.target;
    return guestClub;
}
function getNextDayOfWeek(date, dayOfWeek) {
    var resultDate = new Date(date.getTime());
    resultDate.setDate(date.getDate() + ((7 + dayOfWeek - date.getDay()) % 7));
    return resultDate.toISOString().split('T')[0];
}
//# sourceMappingURL=gather.js.map
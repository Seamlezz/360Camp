"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMatches = void 0;
const node_filter_async_1 = __importDefault(require("node-filter-async"));
const similarity = __importStar(require("string-similarity"));
const uuid = __importStar(require("uuid"));
const _1 = require(".");
const clubs_1 = require("./clubs");
const readMatches = async () => {
    const matches = await Promise.all([
        getNextDayOfWeek(new Date(), 6),
        getNextDayOfWeek(new Date(), 7),
    ].map((d) => gatherData(d)));
    return matches.reduce((acc, m) => acc.concat(m), []);
};
exports.readMatches = readMatches;
async function gatherData(startDate) {
    const page = await _1.getPage();
    const url = `https://www.phoenixhockey.nl/site/default.asp?org=100&option=100&SB_DatumWedstrijd=${startDate}`;
    console.log("Checking url:", url);
    await page.goto(url, {
        waitUntil: 'domcontentloaded',
    });
    const lines = await page.$x('//*[contains(text(), "1 Rabobank veld") or contains(text(), "2 Broekhuis veld")]/ancestor::tr[contains(@class, "even_wedstrijden") or contains(@class, "odd_wedstrijden")]');
    const filteredLines = await node_filter_async_1.default(lines, async (e) => {
        const line = await e.evaluate((element) => {
            return element.querySelectorAll('td')[2].innerHTML;
        });
        return !line.includes("Reservering");
    });
    const data = await Promise.all(filteredLines.map(e => mapRow(e, startDate)));
    await page.close();
    return data;
}
async function mapRow(line, startDate) {
    const [team, guestClub, isField1, startTime] = await Promise.all([
        line.evaluate((element) => {
            return element.querySelectorAll('td')[0].children[0].children[0].innerHTML;
        }),
        line.evaluate((element) => {
            return element.querySelectorAll('td')[2].innerHTML;
        }),
        line.evaluate((element) => element.innerHTML.includes('1 Rabobank veld')),
        line.evaluate((element) => {
            return element.querySelectorAll('td')[5].innerHTML;
        })
    ]);
    const guestInfo = getGuestClub(guestClub);
    return {
        id: uuid.v4(),
        team: getTeamName(team),
        duration: 5400,
        field: isField1 ? 1 : 2,
        guestClub: guestInfo.guestClub,
        guestTeam: guestInfo.guestTeam,
        startDate: startDate,
        startTime: startTime,
        oldRow: `${team} - ${guestClub}`
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
    return `${teamConsonants}${teamId}`.toUpperCase();
}
function getGuestClub(club) {
    let guestClub = club
        .replace("Meisjes ", "M")
        .replace('Senioren ', '')
        .replace("Dames ", "D")
        .replace("Heren ", "H")
        .replace("Jong ", "J")
        .replace("Veterinnen ", "D30")
        .replace("Veteranen ", "H35")
        .replace(/(H\d{2})(\d{2}[A-Z])/g, "H$2");
    const lastIndex = guestClub.lastIndexOf(' ');
    const guestTeam = guestClub.substring(lastIndex).trim();
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
        .replace('!Oefenwedstrijd', '')
        .trim();
    if (guestClub.trim().length === 0)
        guestClub = "Phoenix";
    guestClub = similarity.findBestMatch(guestClub, clubs_1.clubs).bestMatch.target;
    return {
        guestClub: guestClub,
        guestTeam: guestTeam,
    };
}
function getNextDayOfWeek(date, dayOfWeek) {
    const resultDate = new Date(date.getTime());
    resultDate.setDate(date.getDate() + ((7 + dayOfWeek - date.getDay()) % 7));
    return resultDate.toISOString().split('T')[0];
}
//# sourceMappingURL=gather.js.map
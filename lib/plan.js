"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.planRecording = void 0;
const discord_js_1 = require("discord.js");
const _1 = require(".");
const planRecording = async (data) => {
    const page = await _1.getPage();
    await page.goto('https://app.360sportsintelligence.com', {
        waitUntil: 'networkidle2',
    });
    await page.waitForSelector('a[title="recording"]');
    try {
        await createEvent(page, data);
        await addTeam(page, data);
        await sendPlannedMessage(data);
    }
    catch (error) {
        console.error(error);
        await sendFailedMessage(data);
    }
    await page.close();
};
exports.planRecording = planRecording;
const sendPlannedMessage = (match) => _1.sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setColor('#87FD50')
        .setTitle(_1.title(match))
        .setDescription(`Successfuly planned this match!`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
]);
const sendFailedMessage = (match) => _1.sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setColor('#AD0000')
        .setTitle(_1.title(match))
        .setDescription(`Failed to plan this match! ${match.oldRow}`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
]);
async function login(page) {
    await page.type('input[type=email]', _1.INTEL_EMAIL);
    await page.type('input[type=password]', _1.INTEL_PASS.replace(/\\/g, ''));
    await Promise.all([
        page.click('input[type=submit]'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);
}
exports.login = login;
async function createEvent(page, data) {
    await page.click('a[title="recording"]');
    await page.click('a[alt="Add a new recording"]');
    await page.type('#title', `${data.team} - ${data.guestClub} ${data.guestTeam}`);
    await page.select('#duration', `${data.duration}`);
    const selectElem = await page.$('#recording_setup_id');
    if (selectElem !== null)
        await selectElem.type(`SV Phoenix ${data.field}`);
    if (data.guestClub !== 'Onbekend')
        try {
            await page.select('#guest_club', `${data.guestClub}`);
        }
        catch (error) {
            console.error(error);
        }
    const [liveCheck] = await page.$x(`//span[contains(text(),'Start livestream during recording')]`);
    if (liveCheck) {
        await liveCheck.click();
    }
    await page.click('a[alt="More options"]');
    await page.type('#start_date', `${data.startDate}`);
    await page.type('#start_time', `${data.startTime}`);
    const [button] = await page.$x("//span[contains(text(), 'Plan recording')]");
    if (button) {
        await Promise.all([button.click(), page.waitForSelector('a[alt="Return"]')]);
    }
}
async function addTeam(page, data) {
    const { team, guestClub, guestTeam } = data;
    await page.click(`div[alt="Edit ${team} - ${guestClub} ${guestTeam}"]`);
    const selectTeam = async (t) => {
        const [label] = await page.$x(`//span[contains(text(),'${t}')]/ancestor::div[contains(@class, 'panel-list')]/ancestor::div[@id='view-recording-tab']`);
        if (!label) {
            await page.type('input[name="query-teams"]', `${t}`);
            const teamSelector = await page.$(`#query-teams-${t.toLowerCase()}`);
            if (!teamSelector) {
                console.log("Could not find team:", t);
                return;
            }
            await page.click(`#query-teams-${t.toLowerCase()}`);
            await page.waitForXPath(`//span[contains(text(),'${t}')]/ancestor::div[contains(@class, 'panel-list')]/ancestor::div[@id='view-recording-tab']`);
        }
    };
    await selectTeam(team);
    if (guestClub == "Phoenix") {
        await selectTeam(guestTeam);
    }
}
//# sourceMappingURL=plan.js.map
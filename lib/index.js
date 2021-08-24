"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.title = exports.getChannel = exports.sendEmbededMessage = exports.getPage = exports.client = exports.CHANNEL_ID = exports.MAX_CONCURRENT_REQUESTS = exports.DISCORD_CLIENT_TOKEN = exports.INTEL_PASS = exports.INTEL_EMAIL = void 0;
const builders_1 = require("@discordjs/builders");
const rest_1 = require("@discordjs/rest");
const v9_1 = require("discord-api-types/v9");
const discord_js_1 = require("discord.js");
const puppeteer_1 = __importDefault(require("puppeteer"));
const wait_1 = __importDefault(require("wait"));
const detector_1 = require("./detector");
const filter_1 = require("./filter");
const gather_1 = require("./gather");
const plan_1 = require("./plan");
const pLimit = require('p-limit');
require('dotenv').config();
exports.INTEL_EMAIL = process.env.INTEL_EMAIL;
exports.INTEL_PASS = process.env.INTEL_PASS;
exports.DISCORD_CLIENT_TOKEN = process.env.DISCORD_CLIENT_TOKEN;
exports.MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? "4");
exports.CHANNEL_ID = "879005372000649226";
if (exports.INTEL_EMAIL == undefined || exports.INTEL_PASS == undefined || exports.DISCORD_CLIENT_TOKEN == undefined) {
    throw new Error('The envirorment variables where not configured correctly');
}
exports.client = new discord_js_1.Client({ intents: [discord_js_1.Intents.FLAGS.GUILDS, discord_js_1.Intents.FLAGS.GUILD_MESSAGES] });
let browser;
async function getPage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 720 });
    return page;
}
exports.getPage = getPage;
async function startSession() {
    await clearMessages();
    await sendStartingMessage();
    browser = await puppeteer_1.default.launch({ headless: true });
    const data = await gather_1.readMatches();
    const filtered = await filter_1.filterMatches(data);
    if (filtered.some(m => m.finished == 'canceled')) {
        await sendCancelMessage();
        await browser.close();
        return;
    }
    await sendStartProccessingDuplicatesMessage();
    const loginPage = await getPage();
    await loginPage.goto('https://app.360sportsintelligence.com', {
        waitUntil: 'networkidle0',
    });
    await plan_1.login(loginPage);
    const filteredDuplicates = await detector_1.detectDuplicates(filtered, loginPage);
    await loginPage.close();
    await sendStartPlanningMessage(filteredDuplicates);
    const limit = pLimit(exports.MAX_CONCURRENT_REQUESTS);
    await Promise.all(filteredDuplicates
        .filter(m => m.state == 'run')
        .map((d) => limit(() => plan_1.planRecording(d))));
    filteredDuplicates.filter(m => m.state == 'duplicate').forEach(sendDuplicateMessage);
    filteredDuplicates.filter(m => m.state == 'ignore').forEach(sendIgnoredMessage);
    await browser.close();
    await sendFinishedMessage();
}
const commands = [
    new builders_1.SlashCommandBuilder().setName('start').setDescription('Start a new planning session'),
].map(c => c.toJSON());
async function init() {
    await exports.client.login(exports.DISCORD_CLIENT_TOKEN);
    const rest = new rest_1.REST({ version: '9' }).setToken(exports.DISCORD_CLIENT_TOKEN);
    const channel = await getChannel();
    const guildId = channel.guild.id;
    const clientId = exports.client.user?.id;
    if (clientId == undefined) {
        throw new Error('The client id was not found');
    }
    await rest.put(v9_1.Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    exports.client.on('interactionCreate', async (i) => {
        if (!i.isCommand())
            return;
        if (i.channel?.id != exports.CHANNEL_ID)
            return;
        const { commandName } = i;
        if (commandName == 'start') {
            i.deferReply();
            await startSession();
        }
    });
    await clearMessages();
}
init().catch(err => {
    console.error(err);
    browser?.close();
    exports.client.destroy();
    process.exit(1);
});
const sendStartingMessage = () => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Waking Up!')
        .setDescription('I am starting to wake up. Lets get to work!'),
]);
const sendCancelMessage = () => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Succesfully Canceled')
        .setDescription('I am sorry that you had to cancel. On the bright side, I can now go to sleep'),
]);
const sendStartProccessingDuplicatesMessage = () => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Looking For Duplicates')
        .setDescription('Beep boop baap, starting to look for duplicates in!'),
]);
const sendStartPlanningMessage = (matches) => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Started To Plan')
        .setDescription(`Starting to plan **${matches.filter(m => m.state === 'run').length}**, ignoring **${matches.filter(m => m.state === 'ignore').length}**, and found **${matches.filter(m => m.state === 'duplicate').length}** duplicates`),
]);
const sendFinishedMessage = () => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Finished Planning')
        .setDescription('Wow that was not a lot of work. Wel, I\'m done now! Going to take a nap 😴'),
]);
const sendDuplicateMessage = (match) => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setColor('#A16100')
        .setTitle(exports.title(match))
        .setDescription(`Found Duplicate match thus ignoring the planning:\n${match.duplicatedMatch}`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
]);
const sendIgnoredMessage = (match) => sendEmbededMessage([new discord_js_1.MessageEmbed()
        .setColor('#FF3434')
        .setTitle(exports.title(match))
        .setDescription(`Ignored this match. Be sure to plan it in manualy: ${match.oldRow}`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
]);
async function sendEmbededMessage(embeds, components = []) {
    const channel = await exports.client.channels.fetch(exports.CHANNEL_ID);
    if (channel == null) {
        throw new Error('Channel not found');
    }
    if (channel.isText()) {
        return await channel.send({ embeds: embeds, components: components });
    }
    else
        throw new Error('Channel is not a text channel');
}
exports.sendEmbededMessage = sendEmbededMessage;
async function clearMessages() {
    const channel = await getChannel();
    await channel.bulkDelete(100);
    await wait_1.default(1500);
    const messages = await channel.messages.fetch({ limit: 100 });
    await Promise.all(messages.map(m => m.delete()));
}
async function getChannel() {
    const channel = await exports.client.channels.fetch(exports.CHANNEL_ID);
    if (channel instanceof discord_js_1.TextChannel)
        return channel;
    else
        throw new Error('Channel is not a text channel');
}
exports.getChannel = getChannel;
const title = (match) => `${match.team} - ${match.guestClub} ${match.guestTeam}`.trim();
exports.title = title;
//# sourceMappingURL=index.js.map
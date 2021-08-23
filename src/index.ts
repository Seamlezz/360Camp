import { Client, Intents, Message, MessageActionRow, MessageEmbed, TextChannel } from 'discord.js';
import puppeteer from 'puppeteer';
import wait from 'wait';
import { detectDuplicates, DetectedMatch } from './detector';
import { filterMatches } from './filter';
import { readMatches } from './gather';
import { login, planRecording } from "./plan";
const pLimit = require('p-limit');

require('dotenv').config()

export const INTEL_EMAIL = process.env.INTEL_EMAIL
export const INTEL_PASS = process.env.INTEL_PASS
export const DISCORD_CLIENT_TOKEN = process.env.DISCORD_CLIENT_TOKEN
export const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? "4")

export const CHANNEL_ID = "879005372000649226";

if (INTEL_EMAIL === undefined || INTEL_PASS === undefined || DISCORD_CLIENT_TOKEN === undefined) {
    throw new Error('The envirorment variables where not configured correctly')
}

export const client = new Client({ intents: [Intents.FLAGS.GUILDS] })
let browser: puppeteer.Browser

export async function getPage() {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 720 })

    return page
}

async function init() {
    await client.login(DISCORD_CLIENT_TOKEN)
    await clearMessages()
    await sendStartingMessage()
    browser = await puppeteer.launch({ headless: false });
    const data = await readMatches();

    const filtered = await filterMatches(data)

    if (filtered.some(m => m.finished == 'canceled')) {
        await sendCancelMessage()
        await browser.close();
        client.destroy();
        return
    }

    await sendStartProccessingDuplicatesMessage()

    const loginPage = await getPage();
    await loginPage.goto('https://app.360sportsintelligence.com', {
        waitUntil: 'networkidle0',
    })
    await login(loginPage);
    const filteredDuplicates = await detectDuplicates(filtered, loginPage)
    await loginPage.close();

    if (true) {
        await sendCancelMessage()
        await browser.close();
        client.destroy();
        return
    }

    await sendStartPlanningMessage()

    const limit = pLimit(MAX_CONCURRENT_REQUESTS);
    await Promise.all(filteredDuplicates
        .filter(m => m.state == 'run')
        .map((d) => limit(() => planRecording(d)))
    )

    filteredDuplicates.filter(m => m.state == 'duplicate').forEach(sendDuplicateMessage)
    filteredDuplicates.filter(m => m.state == 'ignore').forEach(sendIgnoredMessage)

    await browser.close();
    await sendFinishedMessage();
    client.destroy();
}

init().catch(err => {
    console.error(err)
    process.exit(1)
});

const sendStartingMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Waking Up!')
        .setDescription('I am starting to wake up. Lets get to work!'),
    ])

const sendCancelMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Succesfully Canceled')
        .setDescription('I am sorry that you had to cancel. On the bright side, I can now go to sleep'),
    ])

const sendStartProccessingDuplicatesMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Looking For Duplicates')
        .setDescription('Beep boop baap, starting to look for duplicates in!'),
    ])

const sendStartPlanningMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Started To Plan')
        .setDescription('Beep boop baap, starting to plan everyting in!'),
    ])

const sendFinishedMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Finished Planning')
        .setDescription('Wow that was not a lot of work. Wel, I\'m done now! Going to take a nap 😴'),
    ])

const sendDuplicateMessage = (match: DetectedMatch) =>
    sendEmbededMessage([new MessageEmbed()
        .setColor('#A16100')
        .setTitle(`${match.team} - ${match.guestClub} ${match.guestTeam}`)
        .setDescription('Found Duplicate match thus ignoring the planning')
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
    ])

const sendIgnoredMessage = (match: DetectedMatch) =>
    sendEmbededMessage([new MessageEmbed()
        .setColor('#FF3434')
        .setTitle(`${match.team} - ${match.guestClub} ${match.guestTeam}`)
        .setDescription(`Ignored this match. Be sure to plan it in manualy: ${match.oldRow}`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
    ])

export async function sendEmbededMessage(embeds: MessageEmbed[], components: MessageActionRow[] = []): Promise<Message> {
    const channel = await client.channels.fetch(CHANNEL_ID)
    if (channel == null) {
        throw new Error('Channel not found')
    }
    if (channel.isText()) {
        return await channel.send({ embeds: embeds, components: components })
    } else throw new Error('Channel is not a text channel')
}

async function clearMessages() {
    const channel = await client.channels.fetch(CHANNEL_ID)
    if (channel?.isText()) {
        if (channel instanceof TextChannel) await channel.bulkDelete(100)
        await wait(1500)
        const messages = await channel.messages.fetch({ limit: 100 })
        await Promise.all(messages.map(m => m.delete()))
    }
}
import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { ErrorReporting } from "@google-cloud/error-reporting";
import { Routes } from 'discord-api-types/v9';
import { Client, Intents, Message, MessageActionRow, MessageEmbed, TextChannel } from 'discord.js';
import puppeteer from 'puppeteer';
import wait from 'wait';
import { detectDuplicates, DetectedMatch } from './detector';
import { filterMatches } from './filter';
import { Match, readMatches } from './gather';
import { login, planRecording } from "./plan";

const pLimit = require('p-limit');

require('dotenv').config()

export const INTEL_EMAIL = process.env.INTEL_EMAIL
export const INTEL_PASS = process.env.INTEL_PASS
export const DISCORD_CLIENT_TOKEN = process.env.DISCORD_CLIENT_TOKEN
export const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS ?? "4")

export const CHANNEL_ID = "879005372000649226";

if (INTEL_EMAIL == undefined || INTEL_PASS == undefined || DISCORD_CLIENT_TOKEN == undefined) {
    throw new Error('The envirorment variables where not configured correctly')
}

export const errors = new ErrorReporting();
export const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })
let browser: puppeteer.Browser

export async function getPage() {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 720 })

    return page
}

async function startSession() {
    try {
        await clearMessages()

        await sendStartingMessage()

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const data = await readMatches();

        const filtered = await filterMatches(data)

        if (filtered.some(m => m.finished == 'canceled')) {
            await sendCancelMessage()
            await browser.close();
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

        await sendStartPlanningMessage(filteredDuplicates)

        const limit = pLimit(MAX_CONCURRENT_REQUESTS);
        await Promise.all(filteredDuplicates
            .filter(m => m.state == 'run')
            .map((d) => limit(() => planRecording(d)))
        )

        filteredDuplicates.filter(m => m.state == 'duplicate').forEach(sendDuplicateMessage)
        filteredDuplicates.filter(m => m.state == 'ignore').forEach(sendIgnoredMessage)

        await browser.close();
        await sendFinishedMessage();
    } catch (err) {
        console.error(err)
        errors.report(err)
        await sendErrorMessage()
    }
}

const commands = [
    new SlashCommandBuilder().setName('start').setDescription('Start a new planning session'),
].map(c => c.toJSON())

async function init() {
    await client.login(DISCORD_CLIENT_TOKEN)
    const rest = new REST({ version: '9' }).setToken(DISCORD_CLIENT_TOKEN!!);

    const channel = await getChannel()
    const guildId = channel.guild.id
    const clientId = client.user?.id

    if (clientId == undefined) {
        throw new Error('The client id was not found')
    }

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })

    client.on('interactionCreate', async (i) => {
        if (!i.isCommand()) return
        if (i.channel?.id != CHANNEL_ID) return

        const { commandName } = i
        if (commandName == 'start') {
            i.deferReply()
            await startSession()
        }
    })

    await clearMessages()
    await sendWakeMessage()
}

init().catch(err => {
    console.error(err)
    browser?.close()
    client.destroy()
    process.exit(1)
});

const sendWakeMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Waking Up!')
        .setDescription('I am starting to wake up. Lets get to work!')
        .setFooter(`Version: ${require('../../package.json').version}`),
    ])

const sendStartingMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Lets Go!')
        .setDescription('I am getting all the dates!'),
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

const sendStartPlanningMessage = (matches: DetectedMatch[]) =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Started To Plan')
        .setDescription(`Starting to plan **${matches.filter(m => m.state === 'run').length}**, ignoring **${matches.filter(m => m.state === 'ignore').length}**, and found **${matches.filter(m => m.state === 'duplicate').length}** duplicates`),
    ])

const sendFinishedMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Finished Planning')
        .setDescription('Wow that was not a lot of work. Wel, I\'m done now! Going to take a nap 😴'),
    ])

const sendErrorMessage = () =>
    sendEmbededMessage([new MessageEmbed()
        .setAuthor("Barry Smits", "https://cdn.discordapp.com/avatars/775035854560690216/84268d40b70416e32b4e658d711d6219.png?size=256")
        .setColor('#0099ff')
        .setTitle('Something went wrong')
        .setDescription('O wow, something went wrong while executing. Have a look at the error reports for more information'),
    ])

const sendDuplicateMessage = (match: DetectedMatch) =>
    sendEmbededMessage([new MessageEmbed()
        .setColor('#A16100')
        .setTitle(title(match))
        .setDescription(`Found Duplicate match thus ignoring the planning:\n**${match.duplicatedMatch}**`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
    ])

const sendIgnoredMessage = (match: DetectedMatch) =>
    sendEmbededMessage([new MessageEmbed()
        .setColor('#FF3434')
        .setTitle(title(match))
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
    const channel = await getChannel()
    try {
        await channel.bulkDelete(100)
    } catch (e) {
        console.error(e)
        errors.report(e)
    }
    await wait(1500)
    const messages = await channel.messages.fetch({ limit: 100 })
    await Promise.all(messages.map(m => m.delete()))
}

export async function getChannel() {
    const channel = await client.channels.fetch(CHANNEL_ID)
    if (channel instanceof TextChannel) return channel
    else throw new Error('Channel is not a text channel')
}

export const title = (match: Match) => `${match.team} - ${match.guestClub} ${match.guestTeam}`.trim()
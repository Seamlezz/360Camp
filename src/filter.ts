import { ButtonInteraction, Interaction, Message, MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import { getChannel, sendEmbededMessage, title } from ".";
import { loadClassifier } from "./classifier";
import { Match } from "./gather";

// A filtered match type that has all the fields of a match, but adds a state field.
export type FilteredMatch = {
    state: State;
    finished: "canceled" | "processed";
} & Match;

export type FilteringMatch = {
    state: FilterState;
    message: Message | null;
    finished: "canceled" | "processed" | false;
} & Match;

// A state object that can either be 'run', 'ignore'.
export type State = "run" | "ignore";

// A state object that can either be 'run', 'ignore', suspicious', or 'undecided'.
export type FilterState = State | "suspicious" | "undecided";

function createMatchEmbed(match: FilteringMatch): MessageEmbed {
    return new MessageEmbed()
        .setColor(match.finished === 'canceled' ? '#810000' : match.state === 'run' ? '#27d948' : match.state === 'ignore' ? '#FA4D4D' : match.state === 'undecided' ? '#0099ff' : '#ff6f4f')
        .setTitle(title(match))
        .setDescription(`${match.oldRow}`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`)
}

// A function that takes a filtered match and sends a message to discord.
async function sendMatchStateMessage(match: FilteringMatch, interaction: ButtonInteraction | null = null): Promise<FilteringMatch> {
    const embed = createMatchEmbed(match)

    const row = new MessageActionRow()
        .addComponents(new MessageButton()
            .setCustomId(`state-ignore-${match.id}`)
            .setStyle('DANGER')
            .setLabel('Ignore')
            .setDisabled(match.state === 'ignore' || match.finished !== false)
        ).addComponents(new MessageButton()
            .setCustomId(`state-run-${match.id}`)
            .setStyle('SUCCESS')
            .setLabel('Run')
            .setDisabled(match.state === 'run' || match.finished !== false)
        ).addComponents(new MessageButton()
            .setCustomId(`modify-${match.id}`)
            .setStyle('SECONDARY')
            .setLabel('Modify')
            .setDisabled(match.finished !== false)
        )

    if (interaction !== null) {
        await interaction.update({ embeds: [embed], components: [row] })
        return {
            ...match,
        }
    } else {
        const message = match.message != null ? await match.message.edit({ embeds: [embed], components: [row] }) : await sendEmbededMessage([embed], [row])
        return {
            ...match,
            message,
        }
    }

}

async function sendMatchMessage(matches: FilteringMatch[], interaction: ButtonInteraction | null = null, message: Message | null = null): Promise<Message> {
    const isFinished = matches.some(m => m.finished)
    const isCanceled = matches.some(m => m.finished === 'canceled')
    const isProcessed = matches.some(m => m.finished === 'processed')

    const embed = new MessageEmbed()
        .setColor(isProcessed ? "#38FF74" : isCanceled ? "#810000" : '#E838FF')
        .setTitle(`Confirm Matches`)
        .setDescription(`When all the matches are ready, confirm to process`)

    const row = new MessageActionRow()
        .addComponents(new MessageButton()
            .setCustomId(`confirm-cancel`)
            .setStyle('DANGER')
            .setLabel('Cancel All')
            .setDisabled(isFinished)
        ).addComponents(new MessageButton()
            .setCustomId(`confirm-process`)
            .setStyle('SUCCESS')
            .setLabel('Process')
            .setDisabled(!(matches.every(match => match.state === 'ignore' || match.state === 'run')) || isFinished)
        )

    if (interaction !== null) {
        await interaction.update({ embeds: [embed], components: [row] })
        return interaction.message as Message
    } else if (message != null) {
        return message.edit({ embeds: [embed], components: [row] })
    } else {
        return sendEmbededMessage([embed], [row])
    }
}


export function filterMatches(matches: Match[]): Promise<FilteredMatch[]> {
    return new Promise(async (res, rej) => {
        const classifier = await loadClassifier()
        const filteringMatch = matches
            .map((m) => preFilter(m, classifier))
            .sort((m1, m2) => `${m1.startDate} - ${m1.startTime} ${m1.field}`.localeCompare(`${m2.startDate} - ${m2.startTime} ${m2.field}`))

        const map = new Map<string, FilteringMatch>();
        let message: Message | null = null;

        const collector = (await getChannel()).createMessageComponentCollector({ time: 20 * 60 * 1000 })

        collector.on('collect', i => onInteraction(i, map, message, (d) => {
            collector.stop()
            res(d)
        }, (d) => {
            collector.stop()
            rej(d)
        }))

        collector.on('end', (_, reason) => {
            if (reason == 'time') {
                cancelRequest(map, null, message, res)
            }
        })

        for (const match of filteringMatch) {
            map.set(match.id, await sendMatchStateMessage(match));
        }

        message = await sendMatchMessage(filteringMatch)
    })
}

async function onInteraction(
    interaction: Interaction,
    map: Map<string, FilteringMatch>,
    message: Message | null,
    res: (value: FilteredMatch[] | PromiseLike<FilteredMatch[]>) => void,
    rej: (reason?: any) => void,
) {
    try {
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('state-')) {
                const matchId = interaction.customId.split('-').slice(2).join('-')
                const match = map.get(matchId)
                if (match != null) {
                    if (interaction.customId.startsWith('state-ignore')) {
                        const newMatch: FilteringMatch = {
                            ...match,
                            state: 'ignore',
                        }
                        map.set(newMatch.id, await sendMatchStateMessage(newMatch, interaction))
                    } else if (interaction.customId.startsWith('state-run')) {
                        const newMatch: FilteringMatch = {
                            ...match,
                            state: 'run',
                        }
                        map.set(newMatch.id, await sendMatchStateMessage(newMatch, interaction))
                    }
                }
            } else if (interaction.customId.startsWith('modify-')) {
                const matchId = interaction.customId.split('-').slice(1).join('-')
                const match = map.get(matchId)
                if (match != null) {
                    const newMatch = await modifyMatch(match, interaction)
                    map.set(matchId, await sendMatchStateMessage(newMatch))
                }
            } else if (interaction.customId.startsWith('confirm-')) {
                // Check if canceled, if so cancel all
                if (interaction.customId === 'confirm-cancel') {
                    await cancelRequest(map, interaction, null, res);
                } else if (interaction.customId === 'confirm-process') {
                    const matches = [...map.values()]
                    sendMatchMessage(matches.map(m => ({ ...m, state: 'run', finished: 'processed', })), interaction)
                    for (const [, match] of map) {
                        const newMatch: FilteringMatch = {
                            ...match,
                            finished: 'processed',
                        }
                        map.set(newMatch.id, await sendMatchStateMessage(newMatch))
                    }
                    res(matches.map(m => ({ ...m, state: m.state == 'run' ? 'run' : 'ignore', finished: 'processed', })))
                }
            }
            const matches = [...map.values()]
            if (matches.every(m => m.state === 'ignore' || m.state === 'run')) {
                await sendMatchMessage(matches, null, message)
            }
        }
    } catch (e) {
        rej(e)
    }
}

async function cancelRequest(map: Map<string, FilteringMatch>, interaction: ButtonInteraction | null, message: Message | null, res: (value: FilteredMatch[] | PromiseLike<FilteredMatch[]>) => void) {
    const matches = [...map.values()];
    sendMatchMessage(matches.map(m => ({ ...m, state: 'ignore', finished: 'canceled', })), interaction, message);
    for (const [, match] of map) {
        const newMatch: FilteringMatch = {
            ...match,
            state: 'ignore',
            finished: 'canceled',
        };
        map.set(newMatch.id, await sendMatchStateMessage(newMatch));
    }
    res(matches.map(m => ({ ...m, state: 'ignore', finished: 'canceled', })));
}

async function modifyMatch(match: FilteringMatch, interaction: ButtonInteraction): Promise<FilteringMatch> {
    // Create a selection menu for the fields of the match. Capitalize the first letter of the label.
    const row1 = new MessageActionRow()
        .addComponents(new MessageSelectMenu()
            .setCustomId('field-select')
            .setPlaceholder('Select a field')
            .setMinValues(1)
            .addOptions(['team', 'guestClub', 'guestTeam', 'startDate', 'startTime'].map(f => ({
                label: f[0].toUpperCase() + f.slice(1),
                description: `Old value: ${match[f as keyof FilteringMatch]}`,
                value: f,
            })))
        )

    const row2 = new MessageActionRow()
        .addComponents(new MessageButton()
            .setCustomId('field-unknown')
            .setStyle("SECONDARY")
            .setLabel('Change to Unknown')
        )

    const embed = createMatchEmbed(match)

    await interaction.update({ embeds: [embed], components: [row2, row1] })

    return new Promise((res, rej) => {
        const channel = interaction.channel
        if (!channel) {
            rej("Could not find channel")
            return
        }
        let m: FilteringMatch = {
            ...match,
            state: 'run'
        }
        const collector = channel.createMessageComponentCollector({ time: 20000 });
        collector.on('collect', async (i) => {
            if (i.isSelectMenu()) {
                if (i.customId === 'field-select') {
                    i.deferUpdate()
                    for (const value of i.values) {
                        if (collector.ended) return
                        collector.resetTimer()
                        const newValue = await collectFieldValue(value, m[value as keyof FilteringMatch], i.message as Message)
                        m = {
                            ...m,
                            [value]: newValue,
                        }
                    }
                    if (collector.ended) return
                    collector.stop()
                }
            }
            if (i.isButton()) {
                if (i.customId === 'field-unknown') {
                    i.deferUpdate()
                    m = {
                        ...m,
                        guestClub: 'Onbekend',
                        guestTeam: '',
                    }
                    collector.stop()
                }
            }
        })
        collector.on('end', _ => res(m))
    })
}

async function collectFieldValue(field: string, currentValue: any, message: Message): Promise<any> {
    const embed = new MessageEmbed()
        .setTitle(`Please enter the new value for ${field[0] + field.slice(1)}`)
        .setDescription(`Current value: ${currentValue}`)
        .setFooter('You have 15 seconds to reply')

    await message.edit({ embeds: [embed], components: [] })

    return new Promise((res, rej) => {
        const channel = message.channel
        if (!channel) {
            rej("Could not find channel")
            return
        }
        let value = currentValue

        const collector = channel.createMessageCollector({ time: 15000, max: 1, filter: m => !m.author.bot });
        collector.on('collect', (msg) => {
            if (msg.content) {
                value = msg.content
                msg.delete()
            }
        })
        collector.on('end', _ => res(value))
    })
}

function preFilter(match: Match, classifier: any): FilteringMatch {
    const name = title(match)
    const classification: string = classifier.classify(name)
    const state = classification == 'suspicious' ? 'suspicious' : 'undecided'
    return {
        ...match,
        state,
        message: null,
        finished: false,
    }
}
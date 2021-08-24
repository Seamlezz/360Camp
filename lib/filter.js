"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterMatches = void 0;
const discord_js_1 = require("discord.js");
const _1 = require(".");
const classifier_1 = require("./classifier");
function createMatchEmbed(match) {
    return new discord_js_1.MessageEmbed()
        .setColor(match.finished === 'canceled' ? '#810000' : match.state === 'run' ? '#27d948' : match.state === 'ignore' ? '#FA4D4D' : match.state === 'undecided' ? '#0099ff' : '#ff6f4f')
        .setTitle(_1.title(match))
        .setDescription(`${match.oldRow}`)
        .setFooter(`${match.startDate} - ${match.startTime} (${match.field})`);
}
// A function that takes a filtered match and sends a message to discord.
async function sendMatchStateMessage(match, interaction = null) {
    const embed = createMatchEmbed(match);
    const row = new discord_js_1.MessageActionRow()
        .addComponents(new discord_js_1.MessageButton()
        .setCustomId(`state-ignore-${match.id}`)
        .setStyle('DANGER')
        .setLabel('Ignore')
        .setDisabled(match.state === 'ignore' || match.finished !== false)).addComponents(new discord_js_1.MessageButton()
        .setCustomId(`state-run-${match.id}`)
        .setStyle('SUCCESS')
        .setLabel('Run')
        .setDisabled(match.state === 'run' || match.finished !== false)).addComponents(new discord_js_1.MessageButton()
        .setCustomId(`modify-${match.id}`)
        .setStyle('SECONDARY')
        .setLabel('Modify')
        .setDisabled(match.finished !== false));
    if (interaction !== null) {
        await interaction.update({ embeds: [embed], components: [row] });
        return {
            ...match,
        };
    }
    else {
        const message = match.message != null ? await match.message.edit({ embeds: [embed], components: [row] }) : await _1.sendEmbededMessage([embed], [row]);
        return {
            ...match,
            message,
        };
    }
}
async function sendMatchMessage(matches, interaction = null, message = null) {
    const isFinished = matches.some(m => m.finished);
    const isCanceled = matches.some(m => m.finished === 'canceled');
    const isProcessed = matches.some(m => m.finished === 'processed');
    const embed = new discord_js_1.MessageEmbed()
        .setColor(isProcessed ? "#38FF74" : isCanceled ? "#810000" : '#E838FF')
        .setTitle(`Confirm Matches`)
        .setDescription(`When all the matches are ready, confirm to process`);
    const row = new discord_js_1.MessageActionRow()
        .addComponents(new discord_js_1.MessageButton()
        .setCustomId(`confirm-cancel`)
        .setStyle('DANGER')
        .setLabel('Cancel All')
        .setDisabled(isFinished)).addComponents(new discord_js_1.MessageButton()
        .setCustomId(`confirm-process`)
        .setStyle('SUCCESS')
        .setLabel('Process')
        .setDisabled(!(matches.every(match => match.state === 'ignore' || match.state === 'run')) || isFinished));
    if (interaction !== null) {
        await interaction.update({ embeds: [embed], components: [row] });
        return interaction.message;
    }
    else if (message != null) {
        return message.edit({ embeds: [embed], components: [row] });
    }
    else {
        return _1.sendEmbededMessage([embed], [row]);
    }
}
function filterMatches(matches) {
    return new Promise(async (res, rej) => {
        const classifier = await classifier_1.loadClassifier();
        const filteringMatch = matches
            .map((m) => preFilter(m, classifier))
            .sort((m1, m2) => `${m1.startDate} - ${m1.startTime} ${m1.field}`.localeCompare(`${m2.startDate} - ${m2.startTime} ${m2.field}`));
        const map = new Map();
        let message = null;
        const collector = (await _1.getChannel()).createMessageComponentCollector({ time: 120 * 1000 });
        collector.on('collect', i => onInteraction(i, map, message, (d) => {
            collector.stop();
            res(d);
        }, (d) => {
            collector.stop();
            rej(d);
        }));
        collector.on('end', (_, reason) => {
            if (reason == 'time') {
                cancelRequest(map, null, message, res);
            }
        });
        for (const match of filteringMatch) {
            map.set(match.id, await sendMatchStateMessage(match));
        }
        message = await sendMatchMessage(filteringMatch);
    });
}
exports.filterMatches = filterMatches;
async function onInteraction(interaction, map, message, res, rej) {
    try {
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('state-')) {
                const matchId = interaction.customId.split('-').slice(2).join('-');
                const match = map.get(matchId);
                if (match != null) {
                    if (interaction.customId.startsWith('state-ignore')) {
                        const newMatch = {
                            ...match,
                            state: 'ignore',
                        };
                        map.set(newMatch.id, await sendMatchStateMessage(newMatch, interaction));
                    }
                    else if (interaction.customId.startsWith('state-run')) {
                        const newMatch = {
                            ...match,
                            state: 'run',
                        };
                        map.set(newMatch.id, await sendMatchStateMessage(newMatch, interaction));
                    }
                }
            }
            else if (interaction.customId.startsWith('modify-')) {
                const matchId = interaction.customId.split('-').slice(1).join('-');
                const match = map.get(matchId);
                if (match != null) {
                    const newMatch = await modifyMatch(match, interaction);
                    map.set(matchId, await sendMatchStateMessage(newMatch));
                }
            }
            else if (interaction.customId.startsWith('confirm-')) {
                // Check if canceled, if so cancel all
                if (interaction.customId === 'confirm-cancel') {
                    await cancelRequest(map, interaction, null, res);
                }
                else if (interaction.customId === 'confirm-process') {
                    const matches = [...map.values()];
                    sendMatchMessage(matches.map(m => ({ ...m, state: 'run', finished: 'processed', })), interaction);
                    for (const [, match] of map) {
                        const newMatch = {
                            ...match,
                            finished: 'processed',
                        };
                        map.set(newMatch.id, await sendMatchStateMessage(newMatch));
                    }
                    res(matches.map(m => ({ ...m, state: m.state == 'run' ? 'run' : 'ignore', finished: 'processed', })));
                }
            }
            const matches = [...map.values()];
            if (matches.every(m => m.state === 'ignore' || m.state === 'run')) {
                await sendMatchMessage(matches, null, message);
            }
        }
    }
    catch (e) {
        rej(e);
    }
}
async function cancelRequest(map, interaction, message, res) {
    const matches = [...map.values()];
    sendMatchMessage(matches.map(m => ({ ...m, state: 'ignore', finished: 'canceled', })), interaction, message);
    for (const [, match] of map) {
        const newMatch = {
            ...match,
            state: 'ignore',
            finished: 'canceled',
        };
        map.set(newMatch.id, await sendMatchStateMessage(newMatch));
    }
    res(matches.map(m => ({ ...m, state: 'ignore', finished: 'canceled', })));
}
async function modifyMatch(match, interaction) {
    // Create a selection menu for the fields of the match. Capitalize the first letter of the label.
    const row1 = new discord_js_1.MessageActionRow()
        .addComponents(new discord_js_1.MessageSelectMenu()
        .setCustomId('field-select')
        .setPlaceholder('Select a field')
        .setMinValues(1)
        .addOptions(['team', 'guestClub', 'guestTeam', 'startDate', 'startTime'].map(f => ({
        label: f[0].toUpperCase() + f.slice(1),
        description: `Old value: ${match[f]}`,
        value: f,
    }))));
    const row2 = new discord_js_1.MessageActionRow()
        .addComponents(new discord_js_1.MessageButton()
        .setCustomId('field-unknown')
        .setStyle("SECONDARY")
        .setLabel('Change to Unknown'));
    const embed = createMatchEmbed(match);
    await interaction.update({ embeds: [embed], components: [row2, row1] });
    return new Promise((res, rej) => {
        const channel = interaction.channel;
        if (!channel) {
            rej("Could not find channel");
            return;
        }
        let m = {
            ...match,
            state: 'run'
        };
        const collector = channel.createMessageComponentCollector({ time: 20000 });
        collector.on('collect', async (i) => {
            if (i.isSelectMenu()) {
                if (i.customId === 'field-select') {
                    i.deferUpdate();
                    for (const value of i.values) {
                        if (collector.ended)
                            return;
                        collector.resetTimer();
                        const newValue = await collectFieldValue(value, m[value], i.message);
                        m = {
                            ...m,
                            [value]: newValue,
                        };
                    }
                    if (collector.ended)
                        return;
                    collector.stop();
                }
            }
            if (i.isButton()) {
                if (i.customId === 'field-unknown') {
                    i.deferUpdate();
                    m = {
                        ...m,
                        guestClub: 'Onbekend',
                        guestTeam: '',
                    };
                    collector.stop();
                }
            }
        });
        collector.on('end', _ => res(m));
    });
}
async function collectFieldValue(field, currentValue, message) {
    const embed = new discord_js_1.MessageEmbed()
        .setTitle(`Please enter the new value for ${field[0] + field.slice(1)}`)
        .setDescription(`Current value: ${currentValue}`)
        .setFooter('You have 15 seconds to reply');
    await message.edit({ embeds: [embed], components: [] });
    return new Promise((res, rej) => {
        const channel = message.channel;
        if (!channel) {
            rej("Could not find channel");
            return;
        }
        let value = currentValue;
        const collector = channel.createMessageCollector({ time: 15000, max: 1, filter: m => !m.author.bot });
        collector.on('collect', (msg) => {
            if (msg.content) {
                value = msg.content;
                msg.delete();
            }
        });
        collector.on('end', _ => res(value));
    });
}
function preFilter(match, classifier) {
    const name = _1.title(match);
    const classification = classifier.classify(name);
    const state = classification == 'suspicious' ? 'suspicious' : 'undecided';
    return {
        ...match,
        state,
        message: null,
        finished: false,
    };
}
//# sourceMappingURL=filter.js.map
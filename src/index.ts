import path from 'path';
import http from 'http';
import { RTMClient, WebClient } from '@slack/client';
import { registerFont } from 'canvas';
import Trebek from './trebek';
import { SlackResponse } from './types';
import CleverPersistence from './CleverPersistence';

const token = process.env.SLACK_TOKEN as string;
console.log(token)

// The client is initialized and then started to get an active connection to the platform
const rtm = new RTMClient(token);
const web = new WebClient(token);

// Set up fonts:
registerFont(
    path.join(__dirname, '..', 'assets', 'fonts', 'Korinna-Bold.ttf'),
    { family: 'Korinna', weight: 'bold' },
);
registerFont(
    path.join(__dirname, '..', 'assets', 'fonts', 'Korinna-Regular.ttf'),
    { family: 'Korinna' },
);
registerFont(
    path.join(__dirname, '..', 'assets', 'fonts', 'LeagueGothic-Regular.ttf'),
    { family: 'League Gothic' },
);

const trebek = new Trebek({
    sendMessage(payload) {
        if (payload.image) {
            return web.files.upload({
                file: payload.image.buffer,
                filename: payload.image.filename,
                channels: payload.id,
                initial_comment: payload.message,
            });
        } else if (payload.ephemeral) {
            return web.chat.postEphemeral({
                text: payload.message,
                user: payload.ephemeral,
                channel: payload.id,
            });
        } else if (payload.attachments) {
            return web.chat.postMessage({
                channel: payload.id,
                text: payload.message,
                attachments: payload.attachments,
            });
        } else {
            return rtm.sendMessage(payload.message, payload.id);
        }
    },
    addReaction(id, reaction, ts) {
        return web.reactions.add({
            channel: id,
            timestamp: ts,
            name: reaction,
        });
    },
    async getDisplayName(id) {
        const response = (await web.users.info({ user: id })) as SlackResponse;
        return response.user.profile.display_name;
    },
    persistence: new CleverPersistence(web, rtm),
});

rtm.on('connected', async () => {
    console.log(`JeopardyBot connected to Slack instance.`);
    await trebek.start();

    rtm.on('slack_event', (eventType, event) => {
        trebek.event(eventType, event);
    });

    rtm.on('message', message => {
        // Skip messages that have a subtype or are from us:
        if (message.subtype || message.user === rtm.activeUserId) {
            return;
        }

        trebek.input(message);
    });
});

rtm.start();

// Start a HTTP server just to make people happy:
const port = process.env.PORT || 8080;
http.createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('What is healthy?');
}).listen(port, () => {
    console.log('HTTP server started.');
});

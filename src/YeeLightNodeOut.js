// https://www.yeelight.com/download/Yeelight_Inter-Operation_Spec.pdf
// https://github.com/song940/node-yeelight/blob/master/index.js

import Yeelight from 'yeelight2';
import convert from 'color-convert';

import { sanitizeState } from './utils';

function hexToRgbInt(hex) {
    console.log('hexToRgbInt', hex);
    return parseInt('0x' + hex.replace('#', ''), 16);
}

export default function YeeLightNodeOut(RED) {
    return function(config) {
        const node = this;
        let reconnectionTimeout;

        const onInput = msg => {
            console.log(msg.payload);
            const { on, hex, bri, hue, sat, duration } = msg.payload;

            if (on === false) {
                node.yeelight.set_power(on, null, duration);
                return;
            }

            node.yeelight.sync().then(state => {
                const currentState = sanitizeState(state);
                let rgbIntToTurnTo;
                let briToTurnTo;

                if (typeof hex !== 'undefined') {
                    rgbIntToTurnTo = hexToRgbInt(hex);
                    briToTurnTo = bri || convert.hex.hsv(hex)[2];
                } else if (
                    typeof hue !== 'undefined' ||
                    typeof sat !== 'undefined' ||
                    typeof bri !== 'undefined'
                ) {
                    rgbIntToTurnTo = hexToRgbInt(
                        convert.hsv.hex(
                            hue || currentState.hue,
                            sat || currentState.sat,
                            bri || currentState.bright
                        )
                    );
                    briToTurnTo = bri || currentState.bright;
                } else if (on) {
                    node.yeelight.set_power(on, null, duration);
                    return;
                }

                const flowExpression = `${duration || 500}, 1, ${rgbIntToTurnTo}, ${briToTurnTo}`;

                console.log(
                    'rgbIntToTurnTo',
                    rgbIntToTurnTo,
                    'briToTurnTo',
                    briToTurnTo,
                    'flowExpression',
                    flowExpression
                );

                let preparePromise;

                if (currentState.on) {
                    preparePromise = Promise.resolve();
                } else {
                    preparePromise = node.yeelight.set_scene('color', rgbIntToTurnTo, 1);
                }

                preparePromise
                    .then(() => {
                        node.yeelight.start_cf(1, 1, flowExpression);
                    })
                    .catch(e => console.log('yeelight error', e));
            });
        };

        const onConnected = () => {
            console.log('connected');
            clearTimeout(reconnectionTimeout);
            node.status({ fill: 'green', shape: 'dot', text: 'Connected' });
        };

        const onDisconnected = () => {
            console.log('disconnected');
            // node.status({ fill: 'red', shape: 'ring', text: 'Disconnected' });
        };

        const onYeelightError = error => {
            console.error('error happened', error);
            reconnectionTimeout = setTimeout(startConnection, 5000);
            node.status({ fill: 'red', shape: 'ring', text: `Connection error: ${error.code}` });
        };

        const startConnection = () => {
            console.log(
                'connecting to yeelight...',
                node.serverConfig.hostname,
                node.serverConfig.port
            );
            node.status({ fill: 'yellow', shape: 'ring', text: 'Connecting...' });
            node.yeelight = new Yeelight(
                `yeelight://${node.serverConfig.hostname}:${node.serverConfig.port}`
            );
            node.yeelight.on('connect', onConnected);
            node.yeelight.on('error', onYeelightError);
            node.yeelight.on('disconnect', onDisconnected);
        };

        (function init() {
            RED.nodes.createNode(node, config);
            node.serverConfig = RED.nodes.getNode(config.server);

            if (!node.serverConfig || !node.serverConfig.hostname) {
                node.status({ fill: 'red', shape: 'ring', text: 'Hostname not set' });
                return;
            }
            startConnection();
            node.on('input', onInput);
            node.on('close', () => {
                console.log('closing');
                clearTimeout(reconnectionTimeout);
                node.yeelight.exit();
            });
        })();
    };
}
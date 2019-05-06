// tslint:disable:no-console
// @ts-ignore
import * as StateMachine from 'javascript-state-machine';

export async function runStateMachine() {
  try {
  const fsm = new StateMachine({
    init: 'waiting',
    methods: {
      // tslint:disable-next-line:no-console
      onConnect: async() => console.log('I am connecting.'),
      onDisconnect: async() => console.log('I am disconnected.'),
      onDiscover: async() => console.log('I am discovering.'),
      onError: async() => console.log('I am in error.'),
      onRead: async() => console.log('I am getting readings.'),
      onRescan: async() => console.log('I am rescanning.'),
      onScan: async() => console.log('I am scanning.'),
    },
    transitions: [
      { name: 'scan', from: 'waiting', to: 'scanning' },
      { name: 'discover', from: 'scanning', to: 'discovery' },
      { name: 'connect', from: 'discovery', to: 'connected' },
      // { name: 'error', from: ['discovery', 'connected', 'reading'], to: 'error' },
      { name: 'read', from: 'connected', to: 'reading' },
      { name: 'disconnect', from: 'reading', to: 'disconnected' },
      { name: 'rescan', from: 'disconnected', to: 'scanning' },
    ],
  });

    await fsm.scan();
    await fsm.discover();
    await fsm.connect();
    await fsm.read();
    await fsm.disconnect();
    await fsm.rescan();

  } catch (e) {
    console.error(e.message, e);
  }
}

runStateMachine();

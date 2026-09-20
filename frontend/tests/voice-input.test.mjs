import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceInput } from '../src/lib/voiceInput.js';

function setup(overrides = {}) {
  const events = { states: [], errors: [], texts: [], completed: [], released: 0, started: 0 };
  class Recognition {
    constructor() { events.recognition = this; }
    start() { events.started++; this.onstart(); }
    stop() { this.onend?.(); }
    abort() { events.aborted = true; }
  }
  const environment = {
    isSecureContext: true,
    SpeechRecognition: Recognition,
    navigator: { mediaDevices: { getUserMedia: async options => {
      assert.deepEqual(options, { audio: true });
      return { getTracks: () => [{ stop() { events.released++; } }] };
    } } },
    ...overrides,
  };
  const controller = createVoiceInput({ environment, language: 'ru-RU',
    onState: value => events.states.push(value), onError: value => events.errors.push(value),
    onText: value => events.texts.push(value), onComplete: value => events.completed.push(value),
  });
  return { controller, events, environment };
}

test('requests microphone, releases probe, transcribes speech and stops', async () => {
  const { controller, events } = setup();
  await controller.start();
  assert.equal(events.released, 1);
  assert.equal(events.recognition.lang, 'ru-RU');
  assert.deepEqual(events.states, ['requesting', 'listening']);
  events.recognition.onresult({ results: [[{ transcript: 'Hello' }], [{ transcript: 'world' }]] });
  controller.stop();
  assert.deepEqual(events.texts, ['Hello world']);
  assert.deepEqual(events.completed, ['Hello world']);
  assert.equal(events.states.at(-1), 'idle');
});

test('insecure context and unsupported browser show specific errors', async () => {
  for (const [overrides, message] of [[{ isSecureContext: false }, /HTTPS/], [{ SpeechRecognition: undefined }, /unavailable/]]) {
    const { controller, events } = setup(overrides);
    await controller.start();
    assert.match(events.errors[0], message);
    assert.equal(events.started, 0);
    assert.equal(events.states.at(-1), 'idle');
  }
});

test('denied permission and missing or busy devices recover to idle', async () => {
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
    const { controller, events } = setup({ navigator: { mediaDevices: { getUserMedia: async () => { throw { name }; } } } });
    await controller.start();
    assert.equal(events.errors.length, 1);
    assert.equal(events.started, 0);
    assert.equal(events.states.at(-1), 'idle');
  }
});

test('synchronous recognition failures are handled', async () => {
  const { controller, events } = setup({ SpeechRecognition: class { start() { throw new Error('service failed'); } } });
  await controller.start();
  assert.equal(events.errors.length, 1);
  assert.equal(events.states.at(-1), 'idle');
});

test('errors never auto-send partial speech', async () => {
  const { controller, events } = setup();
  await controller.start();
  events.recognition.onresult({ results: [[{ transcript: 'partial' }]] });
  events.recognition.onerror({ error: 'network' });
  events.recognition.onend();
  assert.deepEqual(events.completed, []);
  assert.match(events.errors[0], /internet/);
});

for (const action of ['stop', 'cancel']) {
  test(`${action} during permission prompt prevents recording and releases late stream`, async () => {
    let resolve;
    let released = false;
    const { controller, events } = setup({ navigator: { mediaDevices: { getUserMedia: () => new Promise(done => { resolve = done; }) } } });
    const pending = controller.start();
    controller[action]();
    resolve({ getTracks: () => [{ stop() { released = true; } }] });
    await pending;
    assert.equal(released, true);
    assert.equal(events.started, 0);
    assert.deepEqual(events.completed, []);
  });
}

test('leaving the chat aborts recording without sending speech', async () => {
  const { controller, events } = setup();
  await controller.start();
  events.recognition.onresult({ results: [[{ transcript: 'draft' }]] });
  controller.cancel();
  assert.equal(events.aborted, true);
  assert.equal(events.recognition.onend, null);
  assert.deepEqual(events.completed, []);
});

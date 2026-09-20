const errors = {
  NotAllowedError: 'Microphone permission was denied. Open site settings beside the address bar, allow Microphone, then retry. Also check Windows Settings > Privacy & security > Microphone.',
  NotFoundError: 'No microphone was found. Connect a microphone and check your sound settings.',
  NotReadableError: 'The microphone could not be opened. Check your sound settings and close other apps using it, then retry.',
  'not-allowed': 'Speech recognition permission was denied. Allow microphone access in site settings and Windows privacy settings, then retry.',
  'service-not-allowed': 'Your browser blocked its speech recognition service. Open this page in a browser with speech recognition enabled.',
  'audio-capture': 'The speech service could not open your microphone. Check your input device and sound settings.',
  'no-speech': 'No speech was detected. Try the microphone again and speak after Listening appears.',
  network: 'Speech recognition could not reach the speech service. Check your internet connection and retry.',
  'language-not-supported': 'This speech recognition service does not support the selected language. Choose another voice input language.',
};

export function createVoiceInput({ environment = globalThis, language, onState, onText, onError, onComplete }) {
  let recognition;
  let cancelled = false;
  let failed = false;
  let transcript = '';
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onState('idle');
    if (!cancelled && !failed && transcript.trim()) onComplete(transcript.trim());
  };
  const fail = (error) => {
    failed = true;
    if (!cancelled) onError(errors[error.name || error.error] || 'Voice recognition could not start. Please retry your microphone.');
    finish();
  };
  return {
    async start() {
      onState('requesting');
      try {
        if (environment.isSecureContext === false) {
          throw new Error('insecure');
        }
        const Recognition = environment.SpeechRecognition || environment.webkitSpeechRecognition;
        if (!Recognition) {
          onError('Speech recognition is unavailable in this browser. Open this page in a browser that supports voice input, such as Chrome.');
          failed = true;
          finish();
          return;
        }
        // Explicitly request permission and verify that an input device is usable.
        // Release the probe before the recognition service opens its own capture.
        if (environment.navigator?.mediaDevices?.getUserMedia) {
          const stream = await environment.navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        }
        if (cancelled) return;
        recognition = new Recognition();
        recognition.lang = language;
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.onstart = () => { if (!cancelled && !finished) onState('listening'); };
        recognition.onresult = event => {
          if (cancelled || finished) return;
          transcript = Array.from(event.results).map(result => result[0].transcript).join(' ').trim();
          onText(transcript);
        };
        recognition.onerror = event => {
          if (cancelled || finished) return;
          if (event.error === 'aborted') { cancelled = true; finish(); }
          else fail(event);
        };
        recognition.onend = finish;
        recognition.start();
      } catch (error) {
        if (error.message === 'insecure') {
          failed = true;
          onError('Microphone access requires HTTPS or localhost. Open the secure HTTPS address of this site; an HTTP address on your Wi-Fi network cannot request microphone access.');
          finish();
        } else fail(error);
      }
    },
    stop() {
      if (finished) return;
      if (!recognition) { cancelled = true; finish(); return; }
      try { recognition.stop(); } catch (error) { fail(error); }
    },
    cancel() {
      cancelled = true;
      finished = true;
      if (recognition) {
        recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
        try { recognition.abort(); } catch { /* Already stopped. */ }
      }
    },
  };
}

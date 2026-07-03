const DEFAULT_SETTINGS = {
  resolution: 'source',
  fps: 30,
  bitrateMbps: 8,
  audio: true
};

const statusDot = document.querySelector('#statusDot');
const statusTitle = document.querySelector('#statusTitle');
const statusText = document.querySelector('#statusText');
const timer = document.querySelector('#timer');
const resolution = document.querySelector('#resolution');
const fps = document.querySelector('#fps');
const audio = document.querySelector('#audio');
const primaryButton = document.querySelector('#primaryButton');
const optionsButton = document.querySelector('#optionsButton');
const debugLog = document.querySelector('#debugLog');

let currentState = { recording: false, status: 'idle' };
let timerHandle = null;

primaryButton.addEventListener('click', async () => {
  if (currentState.recording) {
    await stopRecording();
  } else {
    await startRecording();
  }
});

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes.recorderState) {
    render(changes.recorderState.newValue || { recording: false, status: 'idle' });
  }

  if (changes.recorderDebug) {
    renderDebug(changes.recorderDebug.newValue || []);
  }
});

init();

async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-state' });
    if (!response?.ok) {
      throw new Error(response?.error || 'Could not read recorder status.');
    }
    render(response.state);
    renderDebug(response.debug || []);
  } catch (error) {
    render({ recording: false, status: 'error', error: extensionError(error) });
  }
}

async function startRecording() {
  setBusy('Starting', 'Requesting access to the current tab...');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'start-recording' });

    if (!response?.ok) {
      throw new Error(response?.error || 'Could not start recording.');
    }

    render(response.state);
  } catch (error) {
    render({ recording: false, status: 'error', error: extensionError(error) });
  }
}

async function stopRecording() {
  setBusy('Saving', 'Finalizing the video...');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'stop-recording' });

    if (!response?.ok) {
      throw new Error(response?.error || 'Could not save the recording.');
    }

    render({
      recording: false,
      status: 'saved',
      filename: response.filename
    });
  } catch (error) {
    render({ recording: false, status: 'error', error: extensionError(error) });
  }
}

function render(state = { recording: false, status: 'idle' }) {
  currentState = state;
  const settings = state.settings || DEFAULT_SETTINGS;

  statusDot.className = `status-dot ${state.status || ''}`;
  resolution.textContent = settings.resolution || DEFAULT_SETTINGS.resolution;
  fps.textContent = String(settings.fps || DEFAULT_SETTINGS.fps);
  audio.textContent = settings.audio === false ? 'Off' : 'On';

  primaryButton.disabled = false;
  primaryButton.classList.toggle('stop', Boolean(state.recording));
  primaryButton.textContent = state.recording ? 'Stop and Download' : 'Start Recording';

  if (state.recording) {
    statusTitle.textContent = 'Recording';
    statusText.textContent = state.tabTitle || 'Current tab';
    startTimer(state.startedAt);
    return;
  }

  stopTimer();

  if (state.status === 'starting') {
    setBusy('Starting', 'Requesting access to the current tab...');
    return;
  }

  if (state.status === 'saving') {
    setBusy('Saving', 'Finalizing the video...');
    return;
  }

  if (state.status === 'saved') {
    statusDot.className = 'status-dot';
    statusTitle.textContent = 'Saved';
    statusText.textContent = state.filename ? `Downloaded ${state.filename}` : 'Downloaded to Chrome downloads.';
    timer.textContent = '00:00';
    return;
  }

  if (state.status === 'error') {
    statusDot.className = 'status-dot error';
    statusTitle.textContent = 'Error';
    statusText.textContent = state.error || 'Something went wrong. Reload the extension and try a normal website tab.';
    timer.textContent = '00:00';
    return;
  }

  statusDot.className = 'status-dot';
  statusTitle.textContent = 'Ready';
  statusText.textContent = 'Record the current tab.';
  timer.textContent = '00:00';
}

function setBusy(title, text) {
  primaryButton.disabled = true;
  primaryButton.textContent = title === 'Saving' ? 'Saving...' : 'Starting...';
  primaryButton.classList.remove('stop');
  statusDot.className = `status-dot ${title === 'Saving' ? 'saving' : ''}`;
  statusTitle.textContent = title;
  statusText.textContent = text;
}

function startTimer(startedAt) {
  stopTimer();
  updateTimer(startedAt);
  timerHandle = setInterval(() => updateTimer(startedAt), 1000);
}

function stopTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

function updateTimer(startedAt) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - (startedAt || Date.now())) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  timer.textContent = `${pad(minutes)}:${pad(seconds)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function renderDebug(entries) {
  debugLog.textContent = entries.length ? entries.join('\n') : 'No debug events yet.';
}

function extensionError(error) {
  const message = error?.message || String(error);

  if (message.includes('Receiving end does not exist')) {
    return 'The extension worker is not ready. Reload the extension in chrome://extensions.';
  }

  return message;
}

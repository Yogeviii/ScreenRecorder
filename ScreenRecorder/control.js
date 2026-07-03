const timer = document.querySelector('#timer');
const statusTitle = document.querySelector('#statusTitle');
const tabTitle = document.querySelector('#tabTitle');
const captureMode = document.querySelector('#captureMode');
const resolution = document.querySelector('#resolution');
const fps = document.querySelector('#fps');
const audio = document.querySelector('#audio');
const stopButton = document.querySelector('#stopButton');
const optionsButton = document.querySelector('#optionsButton');

let startedAt = Date.now();
let timerHandle = null;

init();

stopButton.addEventListener('click', async () => {
  stopButton.disabled = true;
  stopButton.textContent = 'Stopping';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'stop-recording' });

    if (!response?.ok) {
      throw new Error(response?.error || response?.result?.error || 'Could not stop the recording.');
    }

    statusTitle.textContent = 'Saved';
    stopButton.textContent = 'Saved';
    setTimeout(() => window.close(), 600);
  } catch (error) {
    statusTitle.textContent = 'Could not save';
    tabTitle.textContent = error.message;
    stopButton.disabled = false;
    stopButton.textContent = 'Stop';
  }
});

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'get-state' });
  const state = response?.state;

  if (!state?.recording) {
    window.close();
    return;
  }

  startedAt = state.startedAt || Date.now();
  tabTitle.textContent = state.tabTitle || 'Chrome tab';
  captureMode.textContent = state.settings?.captureMode === 'tab' ? 'Tab' : 'Window';
  resolution.textContent = state.settings?.resolution || '1080p';
  fps.textContent = state.settings?.fps || '30';
  audio.textContent = state.settings?.audio ? 'On' : 'Off';

  updateTimer();
  timerHandle = setInterval(updateTimer, 1000);
}

function updateTimer() {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  timer.textContent = `${pad(minutes)}:${pad(seconds)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

window.addEventListener('beforeunload', () => {
  if (timerHandle) {
    clearInterval(timerHandle);
  }
});

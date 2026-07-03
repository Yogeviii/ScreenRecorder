const OFFSCREEN_DOCUMENT = 'offscreen.html';
const STATE_KEY = 'recorderState';
const SETTINGS_KEY = 'recorderSettings';
const DEBUG_KEY = 'recorderDebug';

const DEFAULT_SETTINGS = {
  resolution: 'source',
  fps: 30,
  bitrateMbps: 8,
  audio: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);

  if (!settings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }

  await clearRecordingState();
});

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.error?.current) {
    appendDebugLog(`download ${delta.id} failed: ${delta.error.current}`);
  }

  if (delta.state?.current === 'complete') {
    appendDebugLog(`download ${delta.id} complete`);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.target === 'offscreen') {
    return false;
  }

  if (message.type === 'get-state') {
    Promise.all([getRecordingState(), getDebugLog()])
      .then(([state, debug]) => sendResponse({ ok: true, state, debug }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'start-recording') {
    startActiveTabRecording()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'stop-recording') {
    stopRecording()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'recording-started') {
    updateBadge(true);
    return false;
  }

  if (message.type === 'debug-log') {
    appendDebugLog(message.entry);
    return false;
  }

  if (message.type === 'recording-ready') {
    downloadRecording(message)
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'recording-stopped') {
    clearRecordingState();
    return false;
  }

  if (message.type === 'recording-error') {
    handleRecordingError(message.error || 'Recording failed');
    return false;
  }

  return false;
});

async function startActiveTabRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return startTabRecording(tab);
}

async function startTabRecording(tab) {
  if (!tab?.id) {
    return handleRecordingError('No active tab was found.');
  }

  if (isRestrictedTab(tab.url)) {
    return handleRecordingError('Chrome internal pages cannot be recorded. Open a normal website tab first.');
  }

  const settings = await getSettings();
  await clearDebugLog();
  await appendDebugLog(`start requested for: ${tab.title || tab.url || 'active tab'}`);
  await setRecordingState({
    recording: false,
    status: 'starting',
    startedAt: null,
    tabId: tab.id,
    tabTitle: tab.title || 'Chrome tab',
    tabUrl: tab.url || '',
    settings
  });

  try {
    await ensureOffscreenDocument();
    await appendDebugLog('offscreen document ready');

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    await appendDebugLog('tab capture stream id created');

    const state = {
      recording: true,
      status: 'recording',
      startedAt: Date.now(),
      tabId: tab.id,
      tabTitle: tab.title || 'Chrome tab',
      tabUrl: tab.url || '',
      settings
    };

    await setRecordingState(state);

    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'start-recording',
      streamId,
      settings,
      metadata: {
        startedAt: state.startedAt,
        tabTitle: state.tabTitle
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'The recorder could not start.');
    }

    await updateBadge(true);
    return { ok: true, state };
  } catch (error) {
    return handleRecordingError(error.message || 'The recorder could not start.');
  }
}

async function stopRecording() {
  const currentState = await getRecordingState();

  if (!currentState?.recording) {
    await clearRecordingState();
    return { ok: true, stopped: false };
  }

  await setRecordingState({
    ...currentState,
    status: 'saving'
  });
  await appendDebugLog('stop requested');

  try {
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'stop-recording'
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'The recorder could not stop cleanly.');
    }

    await clearRecordingState();
    return { ok: true, stopped: true, filename: response.filename };
  } catch (error) {
    return handleRecordingError(error.message || 'The recorder could not save the file.');
  }
}

async function downloadRecording({ url, filename }) {
  if (!url || !filename) {
    throw new Error('The completed recording did not include a download URL.');
  }

  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs: false
  });

  await appendDebugLog(`download started: ${filename}`);
  return downloadId;
}

let creatingOffscreenDocument = null;

async function ensureOffscreenDocument() {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [documentUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ['USER_MEDIA', 'BLOBS'],
      justification: 'Record the active Chrome tab and create a downloadable video blob.'
    });
  }

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function getSettings() {
  const { [SETTINGS_KEY]: saved } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(saved || {}), resolution: 'source' };
}

async function getRecordingState() {
  const { [STATE_KEY]: state } = await chrome.storage.local.get(STATE_KEY);
  return state || { recording: false, status: 'idle' };
}

async function getDebugLog() {
  const { [DEBUG_KEY]: debug } = await chrome.storage.local.get(DEBUG_KEY);
  return Array.isArray(debug) ? debug : [];
}

async function clearDebugLog() {
  await chrome.storage.local.set({ [DEBUG_KEY]: [] });
}

async function appendDebugLog(entry) {
  if (!entry) {
    return;
  }

  const debug = await getDebugLog();
  debug.push(`${new Date().toLocaleTimeString()} ${entry}`);
  await chrome.storage.local.set({ [DEBUG_KEY]: debug.slice(-12) });
}

async function setRecordingState(state) {
  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...state,
      updatedAt: Date.now()
    }
  });
}

async function clearRecordingState() {
  await chrome.storage.local.remove(STATE_KEY);
  await updateBadge(false);
}

async function updateBadge(isRecording) {
  await chrome.action.setBadgeText({ text: isRecording ? 'REC' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: isRecording ? '#d7263d' : '#3b3b3b' });
}

async function handleRecordingError(message) {
  console.error(message);
  await appendDebugLog(`error: ${message}`);
  await setRecordingState({
    recording: false,
    status: 'error',
    error: message
  });
  await chrome.action.setBadgeText({ text: 'ERR' });
  await chrome.action.setBadgeBackgroundColor({ color: '#9b1c31' });

  return { ok: false, error: message };
}

function isRestrictedTab(url = '') {
  return /^(chrome|chrome-extension|edge|about|devtools):/i.test(url);
}

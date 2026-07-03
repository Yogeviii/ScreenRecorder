let mediaRecorder = null;
let sourceStream = null;
let recordingStream = null;
let recorderChunks = [];
let audioContext = null;
let startedAt = null;
let tabTitle = 'Chrome tab';
let totalBytes = 0;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') {
    return false;
  }

  if (message.type === 'start-recording') {
    startRecording(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        chrome.runtime.sendMessage({ type: 'recording-error', error: error.message });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'stop-recording') {
    stopRecording()
      .then((result) => sendResponse(result))
      .catch((error) => {
        chrome.runtime.sendMessage({ type: 'recording-error', error: error.message });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  return false;
});

async function startRecording({ streamId, settings, metadata, captureSource = 'tab' }) {
  if (mediaRecorder?.state === 'recording') {
    throw new Error('A recording is already running.');
  }

  tabTitle = metadata?.tabTitle || 'Chrome tab';
  recorderChunks = [];
  totalBytes = 0;
  debugLog('offscreen start received');

  sourceStream = captureSource === 'display'
    ? await getDisplayStream(settings)
    : await getTabStream(streamId, settings);
  startedAt = metadata?.startedAt || Date.now();
  debugLog(describeStream(sourceStream));

  keepTabAudioAudible(sourceStream, settings.audio && captureSource === 'tab');
  recordingStream = sourceStream;

  const mimeType = pickMimeType();
  const recorderOptions = {
    videoBitsPerSecond: Number(settings.bitrateMbps || 8) * 1_000_000,
    audioBitsPerSecond: settings.audio ? 128_000 : undefined
  };

  if (mimeType) {
    recorderOptions.mimeType = mimeType;
  }

  mediaRecorder = new MediaRecorder(recordingStream, recorderOptions);
  debugLog(`media recorder started with ${mediaRecorder.mimeType || 'default mime type'}`);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recorderChunks.push(event.data);
      totalBytes += event.data.size;
      debugLog(`chunk ${recorderChunks.length}: ${event.data.size} bytes, total ${totalBytes}`);
    } else {
      debugLog('empty data chunk received');
    }
  };

  mediaRecorder.start(1000);

  chrome.runtime.sendMessage({ type: 'recording-started' });
  return { ok: true, startedAt };
}

async function getDisplayStream(settings) {
  debugLog('opening screen/window picker');

  return navigator.mediaDevices.getDisplayMedia({
    audio: Boolean(settings.audio),
    video: {
      frameRate: Number(settings.fps || 30)
    }
  });
}

async function getTabStream(streamId, settings) {
  return navigator.mediaDevices.getUserMedia({
    audio: settings.audio
      ? {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        }
      : false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        maxFrameRate: settings.fps
      }
    }
  });
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    cleanup();
    chrome.runtime.sendMessage({ type: 'recording-stopped' });
    return { ok: true, stopped: false };
  }

  try {
    await new Promise((resolve, reject) => {
      mediaRecorder.addEventListener('stop', resolve, { once: true });
      mediaRecorder.addEventListener('error', () => reject(new Error('The recorder failed while stopping.')), { once: true });
      debugLog('requesting final data');
      mediaRecorder.requestData();
      mediaRecorder.stop();
    });

    const saved = await saveRecording();
    chrome.runtime.sendMessage({ type: 'recording-stopped' });
    return { ok: true, stopped: true, ...saved };
  } finally {
    cleanup();
  }
}

function keepTabAudioAudible(stream, enabled) {
  if (!enabled || stream.getAudioTracks().length === 0) {
    return;
  }

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(audioContext.destination);
  debugLog('tab audio routed to speakers');
}

async function saveRecording() {
  const mimeType = mediaRecorder?.mimeType || 'video/webm';
  const blob = new Blob(recorderChunks, { type: mimeType });
  debugLog(`saving blob: ${blob.size} bytes from ${recorderChunks.length} chunks`);
  if (!blob.size) {
    throw new Error('The recording was empty. Try recording for a few more seconds.');
  }

  const url = URL.createObjectURL(blob);
  const filename = `${safeName(tabTitle)}-${formatTimestamp(startedAt)}.webm`;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'recording-ready',
      url,
      filename
    });

    if (response?.ok) {
      return { filename, downloadId: response.downloadId };
    }

    debugLog(`downloads api failed: ${response?.error || 'unknown error'}`);
    triggerDownload(url, filename);
    return { filename, fallbackDownload: true };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  debugLog(`fallback anchor download triggered: ${filename}`);
}

function cleanup() {
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  [recordingStream, sourceStream].forEach((stream) => {
    stream?.getTracks().forEach((track) => track.stop());
  });

  mediaRecorder = null;
  sourceStream = null;
  recordingStream = null;
  recorderChunks = [];
  totalBytes = 0;
}

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp || Date.now());
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('-');
}

function safeName(value) {
  return (value || 'screen-recording')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    || 'screen-recording';
}

function describeStream(stream) {
  const videoTracks = stream.getVideoTracks();
  const audioTracks = stream.getAudioTracks();
  const video = videoTracks[0];
  const settings = video?.getSettings?.() || {};

  return [
    `stream tracks: video ${videoTracks.length}, audio ${audioTracks.length}`,
    settings.width && settings.height ? `video ${settings.width}x${settings.height}` : '',
    settings.frameRate ? `${settings.frameRate}fps` : '',
    video ? `video state ${video.readyState}` : ''
  ].filter(Boolean).join(', ');
}

function debugLog(entry) {
  chrome.runtime.sendMessage({
    type: 'debug-log',
    entry
  });
}

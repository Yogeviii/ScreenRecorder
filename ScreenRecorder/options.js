const SETTINGS_KEY = 'recorderSettings';
const DEFAULT_SETTINGS = {
  resolution: 'source',
  fps: 30,
  bitrateMbps: 8,
  audio: true
};

const form = document.querySelector('#settingsForm');
const savedMessage = document.querySelector('#savedMessage');

loadSettings();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const settings = {
    resolution: formData.get('resolution') || DEFAULT_SETTINGS.resolution,
    fps: Number(formData.get('fps') || DEFAULT_SETTINGS.fps),
    bitrateMbps: Number(formData.get('bitrateMbps') || DEFAULT_SETTINGS.bitrateMbps),
    audio: formData.get('audio') === 'on'
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  savedMessage.textContent = 'Saved';
  setTimeout(() => {
    savedMessage.textContent = '';
  }, 1800);
});

async function loadSettings() {
  const { [SETTINGS_KEY]: saved } = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };

  form.elements.resolution.value = settings.resolution;
  form.elements.fps.value = String(settings.fps);
  form.elements.bitrateMbps.value = String(settings.bitrateMbps);
  form.elements.audio.checked = Boolean(settings.audio);
}

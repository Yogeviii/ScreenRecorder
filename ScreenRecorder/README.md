# Offline Tab Screen Recorder

This is a local Chrome Manifest V3 extension that records the active Chrome tab and downloads a `.webm` file. It does not upload recordings or require a server.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `C:\Users\yogev.amira\Documents\ScreenRecorder`.

## Use it

1. Open the tab you want to record.
2. Click the extension icon.
3. Click **Start Recording** in the popup.
4. Watch the timer while it records.
5. Click **Stop and Download**.
6. Chrome downloads the recording as a `.webm` file in `C:\Users\yogev.amira\Downloads`, unless your Chrome download folder is set to something else.

If you edit the files or receive an updated version, go back to `chrome://extensions` and click the reload button on this extension before testing again.

Chrome does not allow extensions to record Chrome internal pages such as `chrome://extensions`, `chrome://settings`, or the Chrome Web Store. Test on a normal website tab, such as `https://example.com`.

## Debug

Open the extension popup and expand **Debug**. After a failed recording, note the last few lines, especially:

- `stream tracks`
- `chunk`
- `saving blob`
- `download started`
- `download failed`

## Recording settings

Open the extension options page to choose resolution, frame rate, bitrate, and tab audio.

- **Source / 30 FPS / 8 Mbps** is the current reliability-first default. Chrome records the tab at the size it is actually displaying.
- To change effective resolution, resize the Chrome window or zoom the page before recording.
- Higher frame rates and bitrates can look better, but use more CPU and disk space.

Chrome tab capture records the page content and tab audio. It does not record the Chrome toolbar, bookmarks bar, address bar, or other desktop windows.

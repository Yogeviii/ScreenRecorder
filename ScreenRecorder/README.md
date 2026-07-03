# Offline Screen Recorder

This is a local Chrome Manifest V3 extension that records a Chrome window, screen, or active tab and downloads a `.webm` file. It does not upload recordings or require a server.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `C:\Users\yogev.amira\Documents\ScreenRecorder`.

## Use it

1. Open the tab you want to record.
2. Click the extension icon.
3. Click **Start Recording** in the popup.
4. In the Chrome picker, choose the **Window** or **Entire screen** tab, then select the Chrome window or screen that contains the side panel. Do not choose **This tab** if you need the side panel included.
5. Watch the timer while it records.
6. Click **Stop and Download**.
7. Chrome downloads the recording as a `.webm` file in `C:\Users\yogev.amira\Downloads`, unless your Chrome download folder is set to something else.

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

Open the extension options page to choose capture area, resolution, frame rate, bitrate, and audio.

- **Window / screen / Source / 30 FPS / 8 Mbps** is the current default. Use this when you need the main tab and the Chrome side panel in the same recording.
- Choose **Current tab** only when you want the old tab-only behavior without Chrome's screen/window picker.
- To change effective resolution, resize the Chrome window or zoom the page before recording.
- Higher frame rates and bitrates can look better, but use more CPU and disk space.

Window/screen capture records what is visible in the selected Chrome window or screen, including the extension side panel. Current-tab capture records only the page content and tab audio; it does not record the Chrome toolbar, bookmarks bar, address bar, side panel, or other desktop windows.

# Hills Football Mastero

**Record. Tag. Review. Present.** A coaching video-analysis app that turns match footage into coaching insights: from recording, to understanding, to real development.

It is an installable web app (PWA) that runs on tablets, phones and laptops. Everything (videos, tags, clips, presentations) is stored privately **on the device**. There are no accounts and no uploads, and it works offline once installed.

## Features

### 1. Starts with structure
- **Record in the app**: use the device camera (480p/720p/1080p) and tag moments while you film. Footage is saved every few seconds, so a crash or closed tab can be recovered. The screen stays awake while recording.
- **Upload video files**: MP4/MOV/WebM from any camera or recorder.
- **YouTube links**: analyse matches already on YouTube (public or unlisted).
- **Tag key moments** with one tap or a keyboard shortcut: goals, shots, build-up, attacking/defensive transitions, pressing, turnovers, set pieces and more. Tags are fully customisable (name, colour, hotkey, clip pre/post-roll).
- **Live tagging mode**: big touchline buttons, a match clock with halves, and a scoreboard. Attach the video later, set each half's kick-off, and every live tag syncs to the footage.

### 2. Raw footage becomes real insight
- **Filter by player, event type or team** on the match timeline.
- **Identify tactical patterns**: "Clip all shown" turns every filtered event (e.g. all pressing moments) into clips in one go.
- **Trim focused teaching clips in seconds**: mark In/Out (`I`/`O`), clip from a tag, nudge start/end, loop, slow-mo, frame-by-frame.
- **Draw on video** (telestrator): arrows, dashed runs, lines, circles, zones, freehand and labels. Drawings become **freeze-frames** that pause the clip while you explain.

### 3. Do not overwhelm, educate
- **Presentations** grouped by **tactical objective**, each clip with a talking point.
- **Present mode**: full-screen title, objective and clip slides; clips auto-play with freeze-frame drawings; works with presentation clickers (PageUp/PageDown).
- **Player feedback** (strengths / to improve / focus next), linked to clips, shareable as a report.
- **Individual reviews**: build a presentation of one player's clips in one tap.
- **Squad & stats**: roster, per-player involvements by event type, most-involved rankings.
- **Export clips** as video files with drawings and a title caption, then share straight to WhatsApp from phones/tablets via the share sheet. YouTube clips share as a timestamped link.
- **Backup & restore** (with or without videos) to move between devices.

## Keyboard shortcuts (Analyse screen)
| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Back / forward 5 s (Shift: 1 s) |
| , / . | Previous / next frame |
| I / O | Mark in / out |
| Enter | Create clip from marks |
| D | Draw on video |
| G, S, C, B, T, Y, P, U, K, V, F, X | Tag (customisable in Settings) |

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build
```
Camera recording needs `https` or `localhost`.

## Deploy (free, GitHub Pages)
1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or run the *Deploy to GitHub Pages* workflow manually).
3. Open `https://<owner>.github.io/hillsmastero/` on the tablet and choose **Install app** / **Add to Home screen**.

## Browser notes
- Best in **Chrome or Edge** (Android, Windows, macOS, ChromeOS). Safari works for analysis and presenting; clip export depends on the browser's recording support.
- Videos live in the browser's storage for this site. Use **Settings → Protect storage** (or install the app) so the browser doesn't clear it, and make backups.
- Clip export renders in real time, so keep the screen open while it runs.

## Tech
React + TypeScript + Vite, Dexie (IndexedDB), vite-plugin-pwa. No backend.

# ADLC video tutorial: how it's built

The 9-minute tutorial for new users is generated, not recorded, so it can be rebuilt after the dashboard or the commands change. The published video is attached to the [`tutorial-video` release](https://github.com/kororos/adlc/releases/tag/tutorial-video); the Field Guide plays it in its own player, and the README links to it.

| File | What it is |
|---|---|
| `script.mjs` | The video: scenes and their narration beats. `cap` is the subtitle, `say` what the voice reads (spelled for it, e.g. "A D L C"). Edit this to change what is said or shown. |
| `fixtures.mjs` | Made-up dashboard data for a fictional project, `acme/orbit` (a class-booking app for small gyms). No real project's data appears in the video. |
| `fake-server.mjs` | Serves the built dashboard (`dist/`) with that data, on `127.0.0.1:4173`. |
| `shots.mjs` | Screenshots each dashboard tab from the fake server into `shots/`, with the positions of the elements the video zooms to (`shots/boxes.json`). |
| `stage.html` | Draws any moment of the video: title, chapter, bullet, diagram, terminal, Claude-session and dashboard scenes. |
| `build.mjs` | Narration, timeline, frames (headless Chrome) and encoding: `out/adlc-tutorial.m4v`, `.srt` and `.vtt`. |
| `fix-tx3g.py` | Gives the subtitle track the video's size; ffmpeg leaves it 0×0 and QuickTime then shows nothing. |

## The voice: Soniox key

The narration uses [Soniox Text-to-Speech](https://docs.soniox.com/tts) (voice "Imogen"). The build reads the API key from a file and never prints it; it never goes into the repo.

1. Create an API key in the [Soniox Console](https://console.soniox.com) (your project → API keys).
2. Copy it to the clipboard and save it, readable only by you:
   ```bash
   mkdir -p ~/.config/soniox
   pbpaste | tr -d '[:space:]' > ~/.config/soniox/api_key     # macOS; elsewhere: paste it into the file with an editor
   chmod 600 ~/.config/soniox/api_key
   ```
3. Check it works and list the voices (the key stays in a shell variable, not in your history):
   ```bash
   K=$(cat ~/.config/soniox/api_key)
   curl -s -H "Authorization: Bearer $K" https://api.soniox.com/v1/tts-models \
     | jq -r '.models[0].voices[] | "\(.id)\t\(.description)"' | grep -iE 'american|british|australian'
   ```
4. Build with `TTS=soniox` (and `SONIOX_VOICE=<name>` for another voice). Soniox charges per generated audio; the whole video is about 9 minutes, and lines that didn't change come from the cache in `audio/`.

Without a key, leave out `TTS=soniox`: the build uses the macOS `say` voice (`VOICE=Samantha` by default, `RATE=172`), which sounds noticeably robotic.

To rotate the key: create a new one in the Console, overwrite the file the same way, and delete the old key there.

## Build it

Needs Node 22, ffmpeg, Python 3 and Google Chrome (or `CHROME_PATH=<chrome binary>`). macOS for the `say` voice.

```bash
cd docs/video
npm install

# 1. the dashboard, built from this checkout into docs/video/dist
(cd ../../ui/web && npm ci && npx vite build --outDir ../../docs/video/dist)

# 2. screenshots of every tab, from the fake server
node fake-server.mjs &  node shots.mjs;  kill %1

# 3. the video: Soniox voice (see above), or the macOS voice without TTS=soniox
TTS=soniox SONIOX_VOICE=Imogen node build.mjs
```

- **Check a moment without rendering everything:** `node build.mjs --still 12.5 250` writes `out/still-<t>.png`; `--from 60 --to 90` renders only that part (`out/part.mp4`).
- **Narration** is cached per line in `audio/`, so after an edit only the changed lines are generated again. A full render takes about 3 minutes plus the narration.
- **Subtitles** are a track in the `.m4v` that the player turns on and off (QuickTime: View → Subtitles), and a `.srt` for uploads. `BURN_CAPTIONS=1` draws them into the picture instead.
- **Voices:** `SONIOX_VOICE` picks one of Soniox's voices (list them with `GET https://api.soniox.com/v1/tts-models`); without `TTS=soniox`, `VOICE` and `RATE` set the macOS `say` voice.

## Publish a new version

```bash
gh release upload tutorial-video out/adlc-tutorial.m4v out/adlc-tutorial.srt --clobber -R kororos/adlc
# the Field Guide's player: its subtitles and poster live with the guide (commit them)
cp out/adlc-tutorial.vtt ../../ui/web/public/guide/video/
ffmpeg -y -ss 3 -i out/adlc-tutorial.m4v -frames:v 1 -vf scale=1280:-1 -q:v 4 ../../ui/web/public/guide/video/poster.jpg
```

The release's download link stays the same, so the links don't change.

**The Field Guide's player** (▶ Watch the video tutorial) streams the `.m4v` straight from the release, so it plays only once the repository is public; until then it offers the GitHub link. The dashboard's content security policy allows media from `github.com` and GitHub's release-asset hosts for this (`ui/server/server.js`). Browsers can't load subtitles from GitHub, so the guide serves `video/adlc-tutorial.vtt` itself.

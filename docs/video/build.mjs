// Builds the ADLC tutorial video: narration (Soniox with TTS=soniox, else macOS say), timeline, frames (headless Chrome) → out/adlc-tutorial.m4v (+ .srt)
//   node build.mjs                 everything
//   node build.mjs --still 12.5 …  only PNG stills at those times (out/still-<t>.png), for checking
//   node build.mjs --from 60 --to 90   a partial video (out/part.mp4)
import { chromium } from "playwright-core"
import { execFileSync, spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { scenes } from "./script.mjs"

const DIR = import.meta.dirname
const OUT = path.join(DIR, "out"), AUD = path.join(DIR, "audio")
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(AUD, { recursive: true })
const VOICE = process.env.VOICE ?? "Samantha", RATE = process.env.RATE ?? "172", FPS = 25
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim())

// 1. narration, one wav per beat (cached by engine, voice and text)
//   TTS=soniox: Soniox text-to-speech (key read from ~/.config/soniox/api_key, never logged); else macOS say.
const TTS = process.env.TTS ?? "say"
const SONIOX_MODEL = process.env.SONIOX_MODEL ?? "tts-rt-v2", SONIOX_VOICE = process.env.SONIOX_VOICE ?? "Imogen"
const sonioxKey = () => fs.readFileSync(path.join(process.env.HOME, ".config", "soniox", "api_key"), "utf8").trim()
async function narrate(beat) {
  const text = TTS === "soniox" ? (beat.tts ?? beat.say) : beat.say
  const id = TTS === "soniox" ? `soniox|${SONIOX_MODEL}|${SONIOX_VOICE}|${text}` : `${VOICE}|${RATE}|${text}`
  const h = crypto.createHash("sha1").update(id).digest("hex").slice(0, 16)
  const wav = path.join(AUD, `${h}.wav`)
  if (!fs.existsSync(wav)) {
    const raw = path.join(AUD, `${h}.src`)
    if (TTS === "soniox") {
      const res = await fetch("https://tts-rt.soniox.com/tts", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sonioxKey()}` },
        body: JSON.stringify({ model: SONIOX_MODEL, language: "en", voice: SONIOX_VOICE, audio_format: "wav", sample_rate: 48000, text }),
      })
      if (!res.ok) throw new Error(`Soniox TTS ${res.status}: ${(await res.text()).slice(0, 300)}`)
      fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()))
    } else execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", raw + ".aiff", text]), fs.renameSync(raw + ".aiff", raw)
    // trim leading/trailing silence the engine adds, so the timing follows the words
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse", "-ar", "48000", "-ac", "1", wav])
    fs.unlinkSync(raw)
  }
  return { wav, dur: probe(wav) }
}

// What a terminal or chat beat needs on screen (mirrors the schedules in stage.html)
const termNeed = (b) => (b.lines ?? []).reduce((c, l) => c + Math.min(2.4, l.cmd.length / 40) + 0.3 + (l.out ? 0.25 * l.out.length + 0.4 : 0.2), 0.25)
const chatNeed = (b) => (b.msgs ?? []).reduce((c, m) => c + (m.who === "user" ? Math.min(2.2, m.text.length / 45) + 0.9 : 0.5 + 1.2), 0.3)

// 2. timeline
const boxes = JSON.parse(fs.readFileSync(path.join(DIR, "shots", "boxes.json"), "utf8"))
let T = 0
const audioSegs = []   // [file | null(silence), duration]
const tl = { scenes: [], total: 0, shotSizes: Object.fromEntries(Object.entries(boxes).map(([k, v]) => [k, [v.w, v.h]])) }
for (const s of scenes) {
  const lead = s.type === "title" && !s.outro ? 1.2 : s.type === "chapter" ? 0.35 : 0.7
  const sc = { ...s, start: T, beats: [] }
  let t = lead
  audioSegs.push([null, lead])
  for (const b of s.beats) {
    const n = await narrate(b)
    const need = s.type === "terminal" ? termNeed(b) + 0.4 : s.type === "claude" ? chatNeed(b) + 0.4 : 0
    const dur = Math.max(n.dur + 0.45, need)
    sc.beats.push({ ...b, t0: t, dur, audio: n.dur })
    audioSegs.push([n.wav, n.dur], [null, dur - n.dur])
    t += dur
  }
  const tail = s.type === "chapter" ? 0.5 : s.outro ? 2.5 : 0.6
  audioSegs.push([null, tail]); t += tail
  sc.dur = t; T += t
  tl.scenes.push(sc)
}
tl.total = T
tl.captions = process.env.BURN_CAPTIONS === "1"
console.log(`timeline: ${tl.scenes.length} scenes, ${T.toFixed(1)} s (${(T / 60).toFixed(1)} min)`)

// the stage page with the timeline
const stage = fs.readFileSync(path.join(DIR, "stage.html"), "utf8").replace("<script>", `<script>window.TIMELINE=${JSON.stringify(tl)}</script>\n<script>`)
const stageFile = path.join(DIR, "stage.built.html")
fs.writeFileSync(stageFile, stage)

const browser = await chromium.launch({ executablePath: CHROME, args: ["--allow-file-access-from-files"] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
const errs = []; page.on("pageerror", (e) => errs.push(String(e)))
await page.goto("file://" + stageFile); await page.evaluate(() => window.ready)
if (errs.length) { console.error(errs); process.exit(1) }

if (args.includes("--still")) {
  for (const a of args.filter((x) => /^\d+(\.\d+)?$/.test(x))) {
    await page.evaluate((t) => window.renderAt(t), Number(a))
    await page.screenshot({ path: path.join(OUT, `still-${a}.png`) })
    console.log("still", a)
  }
  await browser.close(); process.exit(0)
}

// 3. narration track
const from = Number(opt("--from") ?? 0), to = Math.min(T, Number(opt("--to") ?? T))
const partial = from > 0 || to < T
const listFile = path.join(AUD, "concat.txt")
const silence = (d) => { const f = path.join(AUD, `sil-${Math.round(d * 1000)}.wav`); if (!fs.existsSync(f)) execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", d.toFixed(3), f]); return f }
fs.writeFileSync(listFile, audioSegs.filter(([, d]) => d > 0.001).map(([f, d]) => `file '${f ?? silence(d)}'`).join("\n"))
const narration = path.join(OUT, "narration.wav")
execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", narration])

// captions: a .srt file, also muxed into the mp4 as a subtitle track the player can turn on and off
const srtTime = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}` }
let n = 0
const srt = tl.scenes.flatMap((s) => s.beats.map((b) => `${++n}\n${srtTime(s.start + b.t0)} --> ${srtTime(s.start + b.t0 + b.audio + 0.2)}\n${b.cap}\n`)).join("\n")
const srtFile = path.join(OUT, "adlc-tutorial.srt")
fs.writeFileSync(srtFile, srt)
// the Field Guide's player loads its subtitles from the guide itself (a browser can't load them from the release)
fs.writeFileSync(path.join(OUT, "adlc-tutorial.vtt"), "WEBVTT\n\n" + srt.replace(/^\d+\n/gm, "").replace(/(\d\d:\d\d:\d\d),(\d{3})/g, "$1.$2"))

// 4. frames → ffmpeg
const outFile = path.join(OUT, partial ? "part.mp4" : "adlc-tutorial.av.mp4")
const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  "-ss", from.toFixed(3), "-t", (to - from).toFixed(3), "-i", narration,
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", outFile],
  { stdio: ["pipe", "inherit", "inherit"] })
const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once("drain", res)))
let lastKey = null, lastBuf = null, shots = 0
const frames = Math.round((to - from) * FPS), t0 = Date.now()
for (let f = 0; f < frames; f++) {
  const t = from + f / FPS
  const key = await page.evaluate((t) => window.renderAt(t), t)
  if (key !== lastKey) { lastBuf = await page.screenshot({ type: "jpeg", quality: 92 }); lastKey = key; shots++ }
  await write(lastBuf)
  if (f % 500 === 0) console.log(`frame ${f}/${frames} (${shots} rendered, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)
}
ff.stdin.end()
await new Promise((res) => ff.on("close", res))
await browser.close()
// the captions as a subtitle track (QuickTime: View → Subtitles), in a second pass: muxing them during the
// encode with -shortest stalls ffmpeg. .m4v plays in QuickTime, browsers, VLC and on iOS, and imports into iMovie and Final Cut.
// (A .mov with the same track shows no subtitles in QuickTime, so there is none.)
// fix-tx3g.py gives the track and its text box the video's size: ffmpeg leaves them 0×0 and QuickTime draws nothing.
if (!partial) {
  for (const ext of ["m4v"]) {
    const f = path.join(OUT, `adlc-tutorial.${ext}`)
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", outFile, "-i", srtFile, "-map", "0:v", "-map", "0:a", "-map", "1:s", "-c:v", "copy", "-c:a", "copy",
      "-c:s", "mov_text", "-tag:s", "tx3g", "-height", "1080", "-metadata:s:s:0", "language=eng", "-movflags", "+faststart", f])
    execFileSync("python3", [path.join(DIR, "fix-tx3g.py"), f, "1920", "1080"], { stdio: "inherit" })
  }
  fs.unlinkSync(outFile)
}

console.log(`done: ${outFile} (${frames} frames, ${shots} rendered, ${((Date.now() - t0) / 1000).toFixed(0)} s)`)

# QuizDrop

<p align="center">
  <a href="https://whois607.github.io/QuizDrop/#/install/windows"><img src="icons/btn-windows.svg" alt="Install on Windows" height="56"></a>
  &nbsp;
  <a href="https://whois607.github.io/QuizDrop/#/install/android"><img src="icons/btn-android.svg" alt="Install on Android" height="56"></a>
  &nbsp;
  <a href="https://whois607.github.io/QuizDrop/#/install/ios"><img src="icons/btn-ios.svg" alt="Install on iPhone / iPad" height="56"></a>
</p>

<p align="center">Not sure? <a href="https://whois607.github.io/QuizDrop/#/install"><strong>Open QuizDrop</strong></a> and it works out your device for you.</p>

A simple quiz app in the style of Moodle. Ask Claude to write the questions, paste them in, and sit the quiz. Free, works offline, and nothing leaves your device.

## How to use it

1. **Teach Claude the format (once).** In the app, open **Make quizzes** and either download the Claude skill or copy the instructions into a chat.
2. **Ask for a quiz.** For example: "Make a QuizDrop quiz of 15 questions on these notes, mostly multiple choice with two written questions."
3. **Import it.** Copy Claude's reply, open **Import** in the app, paste, press Import.

Multiple choice, multiple answers, true/false, short answer, numerical, matching and ordering questions are marked instantly. Written answers are marked by Claude: the app gives you a marking request to paste into a chat, and you paste the reply back.

<details>
<summary>For developers</summary>

It is a static site with no build step and no server code. Run it locally with `python -m http.server 8771` in this folder.

| File | What it is |
|---|---|
| `index.html`, `app.css`, `app.js` | The screens |
| `core.js` | Format checking, shuffling and marking (also used by the tests) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install details |
| `samples/solar-system.quiz.json` | A sample quiz using every question type |
| `claude-package/INSTRUCTIONS.md` | The quiz format, written for Claude. The single source for the skill zip and `PASTE-INTO-CLAUDE.md` |
| `tools/build.py` | Rebuilds the icons, skill, zip and paste-in file |
| `tests/run.js` | `node tests/run.js` |

After changing `INSTRUCTIONS.md` or the sample quiz, run `python tools/build.py` and then the tests. After changing any app file, bump `CACHE` in `sw.js`.

</details>

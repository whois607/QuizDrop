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

## Code questions

Like CodeRunner in Moodle: you write code, press **Check**, and see a table of tests with expected and actual output. Check as often as you like; marks are given only when every test passes.

**Python runs inside the app, on your device.**

* The first Python question downloads Python itself (about 10 MB, needs internet once). After that it works offline.
* Python 3.12 with the full standard library.
* Maths and engineering packages, each downloaded the first time your code imports it:

  | Package | For |
  |---|---|
  | NumPy | Arrays, matrices, linear algebra |
  | SciPy | Integration, ODEs, optimisation, root finding, signal processing, statistics |
  | SymPy | Symbolic algebra and calculus |
  | pandas | Tables of data |
  | Matplotlib | Can be imported, but figures are not displayed |

* Limits: no internet access from your code, no access to your files, no plots on screen, and a run is stopped after 10 seconds per test (so an infinite loop cannot freeze the app).
* If Python cannot load when you submit (offline before the first download), the answer is kept and marked "Not tested yet"; press **Run tests** in the review once you are online.
* Quiz writers: the quiz page has **Test the model solutions**, which runs each question's model solution against its own tests.

**MATLAB does not run inside the app.** MATLAB is commercial software with no browser version, and the free equivalent (GNU Octave) only has early experimental browser builds. So MATLAB questions work as a paste-in check: you run your code in MATLAB or Octave yourself, run each test shown, and paste what it prints. The app compares it with the expected output, ignoring spacing, blank lines and `ans =` lines, and treating numbers as equal within 0.0005 (so `5`, `5.0000` and `1.4142` vs `1.414` all match). This relies on you pasting the real output.

Other languages (C, C++, Java) are not supported: they cannot run in a browser without sending code to a server.

<details>
<summary>For developers</summary>

It is a static site with no build step and no server code. Run it locally with `python -m http.server 8771` in this folder.

| File | What it is |
|---|---|
| `index.html`, `app.css`, `app.js` | The screens |
| `core.js` | Format checking, shuffling and marking (also used by the tests) |
| `py-worker.js` | Runs Python answers in a background worker using Pyodide 0.26.4, loaded from the jsDelivr CDN and cached by `sw.js` |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install details |
| `samples/solar-system.quiz.json` | A sample quiz using every question type |
| `claude-package/INSTRUCTIONS.md` | The quiz format, written for Claude. The single source for the skill zip and `PASTE-INTO-CLAUDE.md` |
| `tools/build.py` | Rebuilds the icons, skill, zip and paste-in file |
| `tests/run.js` | `node tests/run.js` |

After changing `INSTRUCTIONS.md` or the sample quiz, run `python tools/build.py` and then the tests. After changing any app file, bump `CACHE` in `sw.js`.

</details>

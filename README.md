# QuizDrop

A simple quiz app in the style of Moodle's quiz activity. Ask Claude to write the questions, paste them in, and sit the quiz. It runs in any browser, installs like an app on Windows, Android and iPhone, and works offline. Nothing leaves your device.

## Question types

| Type | Marked |
|---|---|
| Multiple choice (one answer) | Instantly |
| Multiple answers (tick boxes, partial marks) | Instantly |
| True / false | Instantly |
| Short answer | Instantly, against a list of accepted answers |
| Numerical (with tolerance) | Instantly |
| Matching (partial marks) | Instantly |
| Ordering (partial marks) | Instantly |
| Written | By Claude: copy the marking request into a chat, paste the reply back |

Also: question navigation and flagging, optional time limit, attempt history, review with feedback, share a quiz as a file, and a backup file for moving everything to another device.

## Making quizzes with Claude

The `claude-package/` folder teaches a normal Claude chat the quiz format.

* **`quizdrop-quiz-maker.zip`** - a Claude skill. In Claude: Settings -> Capabilities -> Skills -> upload the zip. After that, just ask for a QuizDrop quiz.
* **`PASTE-INTO-CLAUDE.md`** - the same instructions as plain text. Paste it as the first message of a chat, or into a Project's instructions. Works without skills.

Then:

1. Ask, for example: "Make a QuizDrop quiz of 15 questions on these notes, mostly multiple choice with two written questions."
2. Copy the reply, or download the `.quiz.json` file Claude makes.
3. In the app open **Import**, paste or choose the file, press Import.

The import checks everything first. If something is wrong, nothing is added and you get a list of problems you can paste straight back to Claude.

The app's **Make quizzes** screen has the same downloads and steps.

## Running it

It is a static site: no build step and no server code.

* **Hosted:** serve this folder from GitHub Pages (Settings -> Pages -> deploy from the main branch, root folder).
* **Locally:** `python -m http.server 8771` in this folder, then open http://localhost:8771

Install: in Chrome or Edge use the browser menu -> *Install app* (Windows) or *Add to Home screen* (Android). On iPhone or iPad use Safari's Share -> *Add to Home Screen*.

## Files

| File | What it is |
|---|---|
| `index.html`, `app.css`, `app.js` | The screens |
| `core.js` | Format checking, shuffling and marking (no screen code; also used by the tests) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and install details |
| `samples/solar-system.quiz.json` | A sample quiz using every question type |
| `claude-package/INSTRUCTIONS.md` | The format, written for Claude. The single source for the skill and the paste-in file |
| `tools/build.py` | Rebuilds the icons, skill, zip and paste-in file after editing the instructions |
| `tests/run.js` | `node tests/run.js` |

After changing `INSTRUCTIONS.md` or the sample quiz, run `python tools/build.py` and then the tests. After changing any app file, bump `CACHE` in `sw.js` so installed copies pick up the update.

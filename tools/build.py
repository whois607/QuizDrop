"""Builds the generated files: app icons and the Claude package.

Run from anywhere:  python -X utf8 quiz-app/tools/build.py

claude-package/INSTRUCTIONS.md is the single source. From it this writes
  claude-package/quizdrop-quiz-maker/SKILL.md   (the skill, with its header)
  claude-package/quizdrop-quiz-maker.zip        (upload this to Claude)
  claude-package/PASTE-INTO-CLAUDE.md           (paste this into any chat)
"""
import struct
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKG = ROOT / "claude-package"
SKILL = "quizdrop-quiz-maker"

SKILL_HEADER = """---
name: quizdrop-quiz-maker
description: Write quizzes as QuizDrop quiz files (.quiz.json) and mark written answers from QuizDrop. Use whenever the user asks for a quiz, test, practice questions or revision questions for QuizDrop or "the quiz app", asks for a .quiz.json file, pastes a QUIZDROP MARKING REQUEST, or pastes import errors from QuizDrop.
---

"""

PASTE_HEADER = """For the rest of this chat, follow the instructions below whenever I ask for a quiz or paste a QuizDrop marking request. Reply "Ready" and wait for my request.

---

"""


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5


def icon_png(size):
    """A white tick on the app's blue, full-bleed so it also works as a maskable icon."""
    bg, fg = (15, 108, 191), (255, 255, 255)
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            u, v = (x + 0.5) / size, (y + 0.5) / size
            d = min(seg_dist(u, v, 0.30, 0.52, 0.44, 0.66), seg_dist(u, v, 0.44, 0.66, 0.71, 0.36))
            a = max(0.0, min(1.0, (0.055 - d) * size + 0.5))
            rows.extend(round(bg[i] + (fg[i] - bg[i]) * a) for i in range(3))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b""))


def main():
    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)
    for size in (192, 512):
        (icons / f"icon-{size}.png").write_bytes(icon_png(size))

    body = (PKG / "INSTRUCTIONS.md").read_text(encoding="utf-8")
    example = (ROOT / "samples" / "solar-system.quiz.json").read_text(encoding="utf-8")
    skill_dir = PKG / SKILL
    skill_dir.mkdir(exist_ok=True)
    skill_md = SKILL_HEADER + body + "\n## Full example\n\n`example.quiz.json` in this skill folder is a complete quiz that uses every question type.\n"
    (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8", newline="\n")
    (skill_dir / "example.quiz.json").write_text(example, encoding="utf-8", newline="\n")
    (PKG / "PASTE-INTO-CLAUDE.md").write_text(PASTE_HEADER + body, encoding="utf-8", newline="\n")

    with zipfile.ZipFile(PKG / f"{SKILL}.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for name in ("SKILL.md", "example.quiz.json"):
            z.write(skill_dir / name, f"{SKILL}/{name}")
    print("built icons, SKILL.md, PASTE-INTO-CLAUDE.md and", f"{SKILL}.zip")


if __name__ == "__main__":
    main()

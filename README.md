# 5 Level Up

> Lock in. A minimal pomodoro space with three worlds.

**Live:** https://attridevv.github.io/5-level-up/

1. **Focus**: a pomodoro dial (focus / short / long break) that you link to a task. **Lock in** goes fullscreen and hides everything except the timer.
2. **Mind**: what's on your mind. Write down what you need to finish, pick one, then hit ▶ Focus.
3. **Stats**: a Screen Time-style report: focus per hour or day, % change against your average, what you focused on most, streaks, levels, and 16 bronze/silver/gold achievements.

Keys: `1` `2` `3` switch worlds · `Space` start/pause · `R` reset · `S` skip · `L` lock in · `N` new task.

## Stack

One self-contained `index.html` (inline CSS and JS). No framework, no build step. Your data stays in your browser (`localStorage`, key `5lu-v2`). Export and import it from Settings.

## Run locally

```sh
python3 -m http.server 8000
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

---

Built by [Dev Attri](https://attridevv.com).

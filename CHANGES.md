# RPS Project Changes Summary

This document summarizes the changes made to the project yesterday (June 30, 2026).

---

## 🚀 Live Web Application Link
* **Production Deployment:** [Rpsroom Live Web Link](https://krezzast-web.github.io/RPS/)

---

## 📅 Commit History & Changes

### 1. Configure base path and CI/CD workflow for GitHub Pages deployment
* **Commit hash:** `ff704b6`
* **Author:** krezzast-web
* **Date:** Tue Jun 30 17:20:19 2026 +0400
* **Key Changes:**
  * **CI/CD Pipeline Setup:** Created a Github Actions workflow file at [.github/workflows/ci.yml](file:///c:/Users/trojan/Desktop/web/RPS/.github/workflows/ci.yml).
    * Runs on `push` and `pull_request` to the `main` branch.
    * Performs code checkout, sets up Node.js v20, installs dependencies with `npm ci`.
    * Runs [oxlint](file:///c:/Users/trojan/Desktop/web/RPS/.oxlintrc.json) via `npm run lint`.
    * Builds the production bundle via `npm run build`.
    * Auto-deploys built files in `./dist` to GitHub Pages when a commit is pushed to `main`.
  * **Vite Configuration:** Updated [vite.config.js](file:///c:/Users/trojan/Desktop/web/RPS/vite.config.js) to set `base` path to `'/RPS/'`, aligning Vite's asset path resolution with GitHub Pages hosting.

---

### 2. Initial commit (Scaffolding & App Logic)
* **Commit hash:** `23d7969`
* **Author:** krezzast-web
* **Date:** Tue Jun 30 17:16:47 2026 +0400
* **Key Changes:**
  * Created the main react application wrapper [App.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/App.jsx).
  * **State Management:** Introduced [GameContext.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/context/GameContext.jsx) providing game state, matchmaking logic, wallet connections (mocked), chat logs, and custom room builders.
  * **Dashboard UI:** Added [Lobby.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/components/Lobby.jsx) showing public stake tiers (Ranked, Shrimp, Tuna, Dolphin, Shark, Whale) with dynamic animated activity charts, custom rooms search, top rps ratings leaderboard, and giveaways.
  * **Matchroom UI:** Added [GameRoom.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/components/GameRoom.jsx) containing interactive selectors for Rock/Paper/Scissors, player stats/W-D-L counts, opponent presence, action options (Skip, Block, Report), and tabbed chats.
  * **Header Component:** Added [Header.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/components/Header.jsx) containing Logo, title text, and wallet connect/disconnect triggers.
  * **Styles:** Added a comprehensive [index.css](file:///c:/Users/trojan/Desktop/web/RPS/src/index.css) file defining dark mode styling, custom font parameters, cards, and smooth CSS keyframe animations.
  * **Configuration Files:** Added [.gitignore](file:///c:/Users/trojan/Desktop/web/RPS/.gitignore), [.oxlintrc.json](file:///c:/Users/trojan/Desktop/web/RPS/.oxlintrc.json), [package.json](file:///c:/Users/trojan/Desktop/web/RPS/package.json), and [README.md](file:///c:/Users/trojan/Desktop/web/RPS/README.md).

# Right in the Mole Hole 🐹🔨

Whack-a-Mole for your phone — with **your own photos** as the moles.

## Play
Open the game link on any phone (iPhone or Android), tap **📷 Add photos**, pick a few pictures, and hit **Play**.
To install it like an app: in Safari tap **Share → Add to Home Screen**; in Chrome tap **⋮ → Add to Home screen / Install app**.

## Features
- Import photos from your phone — they're cropped into round "moles"
- Photos stay on the phone; nothing is uploaded anywhere
- 30-second rounds that speed up as time runs out
- Easy / Normal / Hard, with a best score saved for each
- Combo multipliers (×2 at 5 in a row, ×3 at 10), sound effects, vibration
- Share your score with friends
- Works offline once loaded

## Hosting (GitHub Pages)
1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → Save
3. After about a minute the game is live at `https://mjm-1364.github.io/rightinthemolehole/` — send that link to testers.

## Files
| File | What it does |
|---|---|
| `index.html` | Screens: menu, game, results |
| `style.css` | Look and animations |
| `game.js` | Game logic, photo import, sounds |
| `manifest.webmanifest`, `sw.js`, `icon*` | Make it installable and work offline |

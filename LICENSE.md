# License

This repository holds two kinds of material, under two different licences.

## 1. The sheet itself: Creative Commons Attribution 4.0

The sheet's code and design (the HTML, CSS and JavaScript in `public/index.html` other than the rules data
blocks listed below), the build script in `tools/`, the tests in `tests/`, the Firebase settings and the
notes are licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You may copy, share, change and build on them, for any purpose, as long as you credit
"Spheres Character Sheet by mrpilotgamer" and link back to this repository or https://spheres-character-sheet.web.app.

## 2. Rules text: Open Game License 1.0a

The Spheres of Power, Spheres of Might and Spheres of Guile rules text (`public/talents/*.json`, `public/classes/*.json`, and the
`#baseLib`, `#classLib`, `#traitLib`, `#wsLib` and `#persLib` data blocks in `public/index.html`) is Open Game
Content used under the Open Game License Version 1.0a. It is **not** under CC BY: the terms, the Product
Identity exclusions and the copyright notices are in [`OGL.md`](OGL.md).

## Trademarks

Pathfinder is a registered trademark of Paizo Inc. Spheres of Power, Spheres of Might and Spheres of Guile are
products of Drop Dead Studios, LLC. This site is a fan project, not affiliated with or endorsed by either.

## What is not in this repository

- No passwords, keys or player data. Characters saved to a Google account live in the site's Firestore database,
  protected by `firestore.rules`, never in this repository.
- The Firebase settings inside `public/index.html` (`apiKey`, project id) are public by design: every visitor's
  browser receives them. They identify the project; they don't grant access. Access is controlled by the
  database rules.
- The key GitHub uses to deploy is stored as a GitHub Actions secret, which is never shown, even to visitors of
  a public repository.

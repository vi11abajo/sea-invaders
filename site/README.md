# Landing page

Static page served at https://seainvaders.xyz/ (one HTML file, no build step). Assets in `assets/` are derived from the app: key art, icon, sprites and half-size device captures.

Deploy: copy the folder to `/var/www/seainvaders-xyz/` on the VPS (nginx serves it as the domain's root next to `/.well-known/assetlinks.json`). The "Download APK" button points at `/sea-invaders.apk` in the same directory: replace that file with the current signed release build when the app updates.

Preview locally: `python -m http.server 8765 --directory site` and open http://localhost:8765/.

The desktop target cursor (brackets that spin and lock onto buttons and cards) is a plain-JS adaptation of React Bits' TargetCursor, MIT + Commons Clause, credited in the page source. It is skipped on touch screens and under `prefers-reduced-motion`.

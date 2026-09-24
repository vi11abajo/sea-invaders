# Landing page

Static page served at https://seainvaders.xyz/ (one HTML file, no build step). Assets in `assets/` are derived from the app: key art, icon, sprites and half-size device captures.

Deploy: copy the folder to `/var/www/seainvaders-xyz/` on the VPS (nginx serves it as the domain's root next to `/.well-known/assetlinks.json`). The "Download APK" button points at `/sea-invaders.apk` in the same directory: replace that file with the current signed release build when the app updates, and update the size on both download buttons and the version line under the second one.

Preview locally: `python -m http.server 8765 --directory site` and open http://localhost:8765/.

The desktop splash cursor (a WebGL fluid simulation driven by the pointer) and the accordion gallery of the app's screens (desktop widths; narrow screens keep the scrolling strip of phones) are plain-JS adaptations of React Bits' SplashCursor and AccordionGallery, MIT + Commons Clause, credited in the page source. The cursor is skipped on touch screens and under `prefers-reduced-motion`.

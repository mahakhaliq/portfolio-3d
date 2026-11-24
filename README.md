# Maha · Cloud Garden (3D portfolio, three.js)

## Run it
Run node portfolio-local.mjs with Node 22.9+ and open http://127.0.0.1:8139/. Serve only the isolated public assets. GEMINI_API_KEY is a server-side setting. Use a project on the Gemini API free tier. Rebuild hosted output with node build.mjs inside maha-portfolio-site.

## Files
- `cloud-garden.html` – page, UI, import map
- `cloud-garden.js` – scene, environment, lighting, post-processing, game loop
- `character.js` – Maha (smooth stylised character from the concept sheet)
- `audio.js` – generative slow music, wind, birds, fountain, footsteps, plus the `voice/` voice-over clips
- `Maha.blend` / `Maha.glb` – the character model for submission (Blender 5.1)
- `lib/three/` – three.js r161 + the add-ons used (bloom, RoundedBox)

## Controls
WASD / arrows move, E opens a stop, Sound button top-right. Mobile: joystick + Open button.


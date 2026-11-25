# Maha Khaliq Portfolio Project Report

## Project overview

This project is an interactive Web 3D portfolio built as a small, game-like garden. Visitors meet Maha’s character, learn the controls, and explore portfolio sections in the environment.

## Work completed

- Built the 3D environment and interactive scene with Three.js.
- Added a character introduction, welcome animation, voice audio, theme selection, and loading screen.
- Added desktop keyboard controls and mobile touch controls, including movement and jumping.
- Added interactive portfolio stops for education and skills, projects, achievements, chatbot, and contact details.
- Added a garden cinema screen for the promotional video, a robot programming mini-game, and a collectible flower-building mini-game.
- Added the Project Gallery with six gameplay videos and an achievements board using the supplied images.
- Corrected the cinema framing so the fountain does not obscure the film on mobile, and fixed the LinkedIn profile URL.
- Added a contact form with browser and server validation, message length limits, origin checks, a honeypot field, and basic rate limiting.
- Added a RAG-style portfolio chatbot that retrieves relevant portfolio notes, cites them with links, and can use Gemini to phrase answers.
- Prepared the Blender source and exported avatar model, After Effects project, promotional video, and setup README.
- Deployed the portfolio on Vercel and pushed the complete project source to GitHub. Large `.npy` source assets use Git LFS.

## Web 3D concepts used

The experience uses a Three.js scene graph, 3D meshes and materials, lighting, camera framing, animation loops, raycasting and proximity-based interactions, keyboard and touch input, and video textures for the cinema screen. It also uses responsive controls for mobile devices and HTML overlays for accessible menus and forms.

## APIs and environment variables

- `GEMINI_API_KEY` is used by the server-side chatbot to request Gemini responses grounded in retrieved portfolio notes.
- `RESEND_API_KEY` is used by the server-side contact endpoint to send messages through Resend.
- `CONTACT_TO_EMAIL` and `CONTACT_FROM_EMAIL` can configure the recipient and sender. The recipient defaults to Maha’s portfolio email address.

API keys are kept in Vercel environment variables and excluded from the public source repository. The keys themselves are not included in this report.

## Verification

The Vercel production page was checked after deployment. The contact endpoint accepted a test message request with a successful response. Inbox receipt was not independently confirmed, so the recipient should retain the delivered email as submission evidence.

## Project links

- Live portfolio: https://maha-khaliq-portfolio-web.vercel.app/
- Source repository: https://github.com/mahakhaliq/portfolio-3d

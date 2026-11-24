# Maha Khaliq Portfolio

Static portfolio frontend with Vercel Functions for the RAG chatbot and contact form.

## Contact email setup

The form sends messages through Resend from the server side. Set these Vercel Production environment variables:

- `RESEND_API_KEY` — a Resend API key. Add it as a sensitive variable; it is never used in browser code.
- `CONTACT_TO_EMAIL` — recipient inbox (defaults to `mahakhaliq151@gmail.com`).
- `CONTACT_FROM_EMAIL` — optional verified sender. Defaults to `Maha Khaliq Portfolio <onboarding@resend.dev>`; Resend's onboarding sender is limited to the account's verified recipient. For arbitrary delivery, verify a sending domain in Resend and set a sender on that domain.

Redeploy after adding or changing Vercel environment variables. The API validates the fields, limits request size and send frequency, rejects cross-origin requests, and silently accepts a honeypot field. The frontend also uses required fields and email input validation.

If email delivery is not configured or the provider is unavailable, the form reports the problem and visitors can still use the direct email link.

## Local preview

Serve the `public` directory with a static server for the frontend. The email API needs the Vercel Functions runtime and the environment variables above to deliver messages.

// Starts the HTTP server. The app itself is built in app.ts so tests can use it without a port.
import app from './app.js';
import { env, isProd } from './env.js';

app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (isProd && (!env.BREVO_API_KEY || !env.EMAIL_FROM)) {
    console.warn('[mail] BREVO_API_KEY or EMAIL_FROM is not set — signup and password-reset codes will fail to send.');
  }
});
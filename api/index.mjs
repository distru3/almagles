// Vercel serverless entry: every /api/* request is rewritten here (see
// vercel.json) and handled by the same Express app used in local dev.
// server/dist is produced by the build command before functions are bundled.
import app from '../server/dist/app.js';

export default app;

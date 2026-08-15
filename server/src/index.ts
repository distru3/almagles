import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './env.js';
import { resolveUser } from './middleware/resolve-user.js';
import { csrfProtect } from './middleware/csrf.js';
import { errorHandler, notFoundApi } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import postRoutes from './routes/posts.js';
import commentRoutes from './routes/comments.js';
import reactionRoutes from './routes/reactions.js';
import scheduleRoutes from './routes/schedule.js';
import userRoutes from './routes/users.js';

const app = express();
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Login/signup/refresh are expensive; throttle them aggressively.
app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }),
);
app.use(
  '/api/auth/send-code',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false }),
);
app.use(
  '/api/auth/reset-password',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }),
);
app.use(
  '/api/comments',
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }),
);
app.use(
  '/api/posts/:postId/reactions',
  rateLimit({ windowMs: 10 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }),
);
app.use(
  '/api/posts',
  rateLimit({ windowMs: 60 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }),
);

app.use('/api', resolveUser);
app.use('/api', csrfProtect);

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts/:postId/reactions', reactionRoutes);
app.use('/api/comments', commentRoutes);

app.use('/api', notFoundApi);

// Production: serve the built React app and fall back to index.html for SPA routes.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
if (isProd && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
  app.get(/^(?!\/api\/).*/ , (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
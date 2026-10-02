import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isProd, usesSandboxSender } from './env.js';
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
// Render (and most PaaS) sit behind one reverse proxy; without this every
// request appears to come from the proxy IP and shares one rate-limit bucket.
app.set('trust proxy', 1);

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

// Rate limiting for production environments (skip GET reads to avoid locking out normal browsing)
function limiter(windowMinutes: number, limit: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET',
    message: { message: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً' },
  });
}

if (isProd) {
  app.use('/api/auth', limiter(15, 60));
  app.use('/api/auth/send-code', limiter(15, 5));
  app.use('/api/auth/reset-password', limiter(15, 10));
  app.use('/api/comments', limiter(10, 60));
  app.use('/api/posts/:postId/reactions', limiter(10, 120));
  app.use('/api/posts', limiter(60, 120));
}

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
  if (isProd && usesSandboxSender) {
    console.warn(
      `[mail] EMAIL_FROM is ${env.EMAIL_FROM}: Resend only delivers from this sandbox sender to the ` +
        'account owner. Verify a domain in Resend and set EMAIL_FROM to an address on it.',
    );
  }
});
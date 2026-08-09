# رجال الأمة — build & runtime image (Node.js, single service)

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY server/prisma ./server/prisma
RUN npx prisma generate --schema=server/prisma/schema.prisma

COPY server ./server
COPY client ./client
RUN npx tsc -p server/tsconfig.json
RUN npm run build -w client

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app ./

EXPOSE 4000
CMD ["node", "server/dist/index.js"]
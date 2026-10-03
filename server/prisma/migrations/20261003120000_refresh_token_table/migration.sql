-- Move refresh tokens from the User.refreshTokens array into their own table.
-- Order matters: create and copy before dropping the column, so existing
-- sessions survive the deploy.

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy existing sessions. Their issue time isn't recorded, so give each the
-- standard 30-day lifetime from now (the cookie itself expires no later).
INSERT INTO "RefreshToken" ("id", "tokenHash", "userId", "expiresAt")
SELECT gen_random_uuid()::text, t.hash, u."id", CURRENT_TIMESTAMP + INTERVAL '30 days'
FROM "User" u
CROSS JOIN LATERAL unnest(u."refreshTokens") AS t(hash)
ON CONFLICT ("tokenHash") DO NOTHING;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "refreshTokens";

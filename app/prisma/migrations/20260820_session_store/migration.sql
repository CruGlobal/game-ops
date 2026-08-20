-- Session storage for connect-pg-simple.
--
-- Sessions previously lived in express-session's default MemoryStore, which meant every
-- deploy or restart logged everyone out (it is also the only way sessions were ever
-- cleared, since there was no logout route until recently), the store never evicted
-- expired entries, and raising the ECS task count above one would have broken auth
-- outright — a request could land on a task that had never seen the session.
--
-- The table is declared in schema.prisma as well, which is the part that matters:
-- production reconciles with `prisma db push`, so a table that file does not describe
-- can be dropped. Letting connect-pg-simple create it on boot would mean the next
-- deploy silently removed it.
CREATE TABLE IF NOT EXISTS "session" (
    "sid"    TEXT PRIMARY KEY,
    "sess"   JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session"("expire");

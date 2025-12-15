Local setup for gpt-game-express-thread

Prerequisites
- Node.js (>= 18 recommended)
- MySQL server running locally (or Docker)

Quick Local Steps
1. Create a local database and user (see scripts/create_local_db.sql). Example:

   ```sql
   CREATE DATABASE IF NOT EXISTS gpt_chat_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   CREATE USER IF NOT EXISTS 'gptuser'@'localhost' IDENTIFIED BY '1234';
   GRANT ALL PRIVILEGES ON gpt_chat_logs.* TO 'gptuser'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. Copy `.env.example` to `.env` and update values (API keys, DB credentials, SESSION_SECRET).
   - Add your Resend API key as `RESEND_API_KEY` in `.env` to enable email sending in development.
   - The app accepts both `MYSQLDATABASE` and `MYSQL_DATABASE`—either is fine.

Optional: Start a local MySQL with Docker

If you don't have a local MySQL server, use the provided `docker-compose.yml` to start one:

```bash
# start DB in background
docker compose up -d

# check logs (optional)
docker compose logs -f db
```

This docker service creates a `gpt_chat_logs` DB and a `gptuser` user with password `1234` (change as desired).

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start in development mode (uses `NODE_ENV=development` and nodemon):

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000`.

Notes
- If you already have a production dump, import schema/tables into your local DB.
- The `config/database.js` prints connection diagnostics on startup—check console for the "✅ Database connected" message.
- For email links and callback URLs, change any hard-coded railway domains in `utils/emailUtils.js` if you want local verification links.

If you'd like, I can add a Docker Compose file that includes a ready-to-use MySQL container and a seed/import step—shall I add that next?
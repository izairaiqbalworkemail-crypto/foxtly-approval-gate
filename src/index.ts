import "dotenv/config";
import path from "node:path";
import { createServer } from "./server";

const dbPath = process.env.SQLITE_DB_PATH ?? path.resolve(process.cwd(), "data", "approvals.db");
const publicDir = path.resolve(process.cwd(), "public");
const { app } = createServer({ dbPath, publicDir });

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
});

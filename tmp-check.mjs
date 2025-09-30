import { sql } from '@vercel/postgres';

async function main() {
  const { rows } = await sql`SELECT sheet_name, json_data, last_updated FROM synced_data LIMIT 5`;
  console.dir(rows, { depth: null });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

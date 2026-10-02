import { neon } from "@neondatabase/serverless";
import { randomInt } from "node:crypto";
import { buildSku } from "../lib/sku";
import { generateBarcode } from "../lib/barcode";

// Run after importing existing tables and applying database/migration.sql.
// Each reservation + update is one atomic statement, safe to rerun.
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL in .env.local.");
  const sql = neon(process.env.DATABASE_URL);
  const products = await sql.query(
    "select p.id,p.unit_gbp,p.exchange_rate,p.vendor_id,v.name from products p join vendors v on v.id=p.vendor_id where p.sku is null order by p.created_at",
  );
  let saved = 0;
  for (const p of products) {
    const start = randomInt(1000);
    let done = false;
    for (let n = 0; n < 1000; n++) {
      const sku = buildSku(p.name, p.unit_gbp, (start + n) % 1000),
        svg = generateBarcode(sku);
      const result = await sql.query(
        `with reserved as (insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg,redeemed) values($1,$2,$3,$4,$5,true) on conflict(sku) do nothing returning *) update products p set sku=r.sku,barcode_svg=r.barcode_svg from reserved r where p.id=$6 and p.sku is null returning p.id`,
        [sku, p.vendor_id, p.unit_gbp, p.exchange_rate, svg, p.id],
      );
      if (result.length) {
        saved++;
        done = true;
        break;
      }
      const existing = await sql.query("select sku from products where id=$1", [
        p.id,
      ]);
      if (existing[0]?.sku) {
        done = true;
        break;
      }
    }
    if (!done)
      throw new Error(
        `All 1,000 suffixes used for product ${p.id}; a longer suffix is required.`,
      );
  }
  console.log(
    `Assigned SKUs and saved barcodes for ${saved} existing products.`,
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

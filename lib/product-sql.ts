// One statement makes claiming an identifier and saving its product atomic.
export const saveNewProductSql = `
with claim as (
  update sku_reservations set redeemed=true
  where token=$11 and not redeemed and vendor_id=$3
    and unit_gbp=$12 and exchange_rate=$9
  returning *
)
insert into products(
  item_name,description,vendor_id,entry_date,price_inr,quantity,
  discount_percent,shipping_percent,exchange_rate,photo_key,sku,barcode_svg
)
select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,sku,barcode_svg from claim
returning *`;

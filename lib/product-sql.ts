// One statement makes claiming an identifier and saving its product atomic.
export const reserveSkuSql = `
insert into sku_reservations(sku,vendor_id,unit_gbp,exchange_rate,barcode_svg)
select $1,id,$3,$4,$5 from vendors where id=$2 and active and pseudo_code=$6
on conflict(sku) do nothing returning *`;

export const saveNewProductSql = `
with claim as (
  update sku_reservations set redeemed=true
  where token=$11 and not redeemed and vendor_id=$3
    and unit_gbp=$12 and exchange_rate=$9
    and exists(select 1 from vendors v where v.id=sku_reservations.vendor_id and v.active and v.pseudo_code=left(sku_reservations.sku,3))
  returning *
)
insert into products(
  item_name,description,vendor_id,entry_date,price_inr,quantity,
  discount_percent,shipping_percent,exchange_rate,photo_key,sku,barcode_svg,product_type_id
)
select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,sku,barcode_svg,$13 from claim
returning *`;

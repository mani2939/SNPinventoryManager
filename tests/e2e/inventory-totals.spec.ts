import { test, expect } from "@playwright/test";

test("filtered totals span all pages and visible product deletion updates them", async ({page,request})=>{
  test.setTimeout(90000);
  expect((await request.delete('/api/products/00000000-0000-4000-8000-000000000000',{data:{updated_at:'x'}})).status()).toBe(401);
  const headers={Origin:'http://127.0.0.1:3010'};
  const login=await page.request.post('/api/auth/login',{headers,data:{username:'SNPAdmin',password:'SNPRocks'}});
  expect(login.ok()).toBe(true);
  const post=async(url:string,data:unknown)=>{
    const r=await page.request.post(url,{headers,data});expect(r.ok(),await r.text()).toBe(true);return r.json();
  };
  const cfg=await (await page.request.get('/api/config')).json();
  const used=new Set(cfg.vendors.map((v:{pseudo_code:string})=>v.pseudo_code));
  const codes:string[]=[];for(let n=3000;codes.length<2;n++){const c=n.toString(36).toUpperCase();if(!used.has(c))codes.push(c);}
  const stamp=Date.now();const vendor=await post('/api/vendors',{name:`Totals supplier ${stamp}`,pseudo_code:codes[0]});
  const other=await post('/api/vendors',{name:`Other supplier ${stamp}`,pseudo_code:codes[1]});
  expect((await page.request.patch('/api/config',{headers,data:{exchange_rate:100}})).ok()).toBe(true);
  const create=async(n:number,vendor_id=vendor.id,entry_date='2026-01-15')=>{
    const data={item_name:`Totals piece ${stamp} ${n}`,description:'',vendor_id,entry_date,price_inr:100,
      quantity:2,discount_percent:10,shipping_percent:5,photo_key:null};
    const reservation=await post('/api/skus',data);return post('/api/products',{...data,sku_token:reservation.token});
  };
  for(let n=0;n<26;n++)await create(n);
  await create(26,vendor.id,'2025-12-31');await create(27,other.id);
  expect((await page.request.patch('/api/config',{headers,data:{exchange_rate:200}})).ok()).toBe(true);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/inventory');await page.getByLabel('Vendor',{exact:true}).selectOption(vendor.id);
  await page.getByLabel('From date').fill('2026-01-15');await page.getByLabel('To date').fill('2026-01-15');
  const totals=page.getByLabel('Filtered inventory totals');
  const value=(label:string)=>totals.locator('dl > div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
  await expect(value('Products')).toHaveText('26');await expect(value('Pieces')).toHaveText('52');
  await expect(value('Final total · INR')).toHaveText('₹4,914.00');await expect(value('Purchase cost · GBP')).toHaveText('£49.14');await expect(value('Retail value · GBP')).toHaveText('£148.20');
  await expect(value('Discount amount · INR')).toHaveText('₹520.00');await expect(value('Shipping · INR')).toHaveText('₹234.00');
  await page.getByRole('button',{name:'Next page'}).click();await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(value('Final total · INR')).toHaveText('₹4,914.00');
  const remove=page.locator('tbody').getByRole('button',{name:/^Delete Totals piece/});
  await expect(remove).toContainText('Delete');expect(await page.locator('.table-scroll').evaluate(e=>e.scrollLeft)).toBe(0);
  await remove.click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Keep product'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(value('Products')).toHaveText('26');
  await remove.click();await page.getByRole('button',{name:'Delete product',exact:true}).click();await expect(value('Products')).toHaveText('25');await expect(value('Pieces')).toHaveText('50');await expect(value('Final total · INR')).toHaveText('₹4,725.00');await expect(page.getByText('Page 1 of 1',{exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/inventory-totals-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const first=page.locator('tbody tr').first();const productName=await first.locator('.product-cell-inner a').innerText();
  // Stale versions must fail inside the confirmation dialog, rather than behind it.
  const record=await (await page.request.get(`/api/products?vendor=${vendor.id}&from=2026-01-15&to=2026-01-15`)).json();const p=record.products.find((p:{item_name:string})=>p.item_name===productName);
  expect((await page.request.put(`/api/products/${p.id}`,{headers,data:{...p,description:'Changed after table load'}})).ok()).toBe(true);
  await first.getByRole('button',{name:`Delete ${productName}`,exact:true}).click();await page.getByRole('button',{name:'Delete product',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');await page.keyboard.press('Escape');
  await page.getByLabel('From date').fill('2027-01-01');await page.getByLabel('To date').fill('2027-01-01');await expect(value('Products')).toHaveText('0');await expect(value('Final total · INR')).toHaveText('₹0.00');await expect(value('Retail value · GBP')).toHaveText('£0.00');
  await page.getByRole('button',{name:'Clear filters'}).click();await expect(value('Products')).not.toHaveText('0');expect(errors).toEqual([]);
});

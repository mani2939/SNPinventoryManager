import { notFound, redirect } from "next/navigation";
import { authenticated } from "@/lib/auth";
import { getProduct } from "@/lib/repository";
import { ProductForm } from "@/components/product-form";
import { z } from "zod";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await authenticated())) redirect("/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const product = await getProduct(id);
  if (!product) notFound();
  return <ProductForm initial={product} />;
}

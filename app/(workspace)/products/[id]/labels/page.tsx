import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { authenticated } from "@/lib/auth";
import { getProduct } from "@/lib/repository";
import { LabelPrinter } from "@/components/label-printer";
export default async function Labels({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await authenticated())) redirect("/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const p = await getProduct(id);
  if (!p) notFound();
  return <LabelPrinter product={p} />;
}

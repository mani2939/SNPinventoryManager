import { redirect } from "next/navigation";
import { preferredWorkspace } from "@/lib/auth";
export default async function Home() {
  redirect(await preferredWorkspace());
}

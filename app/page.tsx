import { redirect } from "next/navigation";
import { authenticated } from "@/lib/auth";
export default async function Home() {
  redirect((await authenticated()) ? "/inventory" : "/login");
}

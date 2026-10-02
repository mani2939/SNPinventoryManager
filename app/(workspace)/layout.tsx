import { redirect } from "next/navigation";
import { authenticated, demoMode } from "@/lib/auth";
import { Shell } from "@/components/shell";
export default async function Workspace({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await authenticated())) redirect("/login");
  return <Shell demo={demoMode()}>{children}</Shell>;
}

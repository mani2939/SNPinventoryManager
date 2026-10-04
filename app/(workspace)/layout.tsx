import { redirect } from "next/navigation";
import { currentSession, demoMode } from "@/lib/auth";
import { Shell } from "@/components/shell";
export default async function Workspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const session=await currentSession();
  if(!session)redirect("/login");
  return <Shell demo={demoMode()} account={session}>{children}</Shell>;
}

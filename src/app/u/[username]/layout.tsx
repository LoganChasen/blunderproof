import { AnalysisProvider } from "@/web/analysis/AnalysisProvider";
import { AppShell } from "@/web/ui/AppShell";

export default async function PlayerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const name = decodeURIComponent(username);
  return (
    <AnalysisProvider username={name}>
      <AppShell username={name}>{children}</AppShell>
    </AnalysisProvider>
  );
}

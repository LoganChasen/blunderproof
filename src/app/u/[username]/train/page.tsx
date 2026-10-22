import type { Metadata } from "next";
import { TrainingScreen } from "@/web/training/TrainingScreen";

export const metadata: Metadata = { title: "Train · Blunderproof" };

export default async function TrainPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <TrainingScreen username={decodeURIComponent(username)} />;
}

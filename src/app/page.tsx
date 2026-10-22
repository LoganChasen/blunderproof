import { cpToWinPercent } from "../winPercent";
import { config } from "../config";

export default function Home() {
  return <main>Blunderproof {cpToWinPercent(100).toFixed(1)} {config.labels.blunder}</main>;
}

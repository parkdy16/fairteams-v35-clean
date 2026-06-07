import React, { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, CalendarCheck, Shield, Download, Upload } from "lucide-react";
import { PlayersTab } from "@/components/PlayersTab";
import { TodayTab } from "@/components/TodayTab";
import { TeamsTab } from "@/components/TeamsTab";
import { Button } from "@/components/ui/button";
import fairTeamsLogo from "@/assets/fairteams-logo.png";
import {
  RoomPlayer,
  csvToPlayers,
  downloadText,
  loadPlayers,
  normalizePlayer,
  playersToCsv,
  savePlayers,
} from "@/lib/localRoster";

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashVisible, setSplashVisible] = useState(false);

  useEffect(() => {
    const fadeIn = window.setTimeout(() => setSplashVisible(true), 50);
    const fadeOut = window.setTimeout(() => setSplashVisible(false), 2800);
    const finish = window.setTimeout(() => setShowSplash(false), 3000);

    return () => {
      window.clearTimeout(fadeIn);
      window.clearTimeout(fadeOut);
      window.clearTimeout(finish);
    };
  }, []);

  const [players, setPlayers] = useState<RoomPlayer[]>(() => loadPlayers());
  const [activeTab, setActiveTab] = useState("players");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    savePlayers(players);
  }, [players]);

  const replacePlayers = (nextPlayers: RoomPlayer[]) => {
    setPlayers(nextPlayers);
  };

  const exportCsv = () => {
    downloadText("fair-teams-roster.csv", playersToCsv(players), "text/csv;charset=utf-8");
  };

  const exportJson = () => {
    downloadText(
      "fair-teams-roster-backup.json",
      JSON.stringify(players, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith(".json")
      ? JSON.parse(text)
      : csvToPlayers(text);

    if (!Array.isArray(imported)) {
      throw new Error("Import file does not contain a roster list.");
    }

    const normalized = file.name.toLowerCase().endsWith(".json")
      ? imported.map((p, index) => normalizePlayer(p, index)).filter(p => p.name)
      : imported;

    if (normalized.length === 0) {
      alert("No players found in that file.");
      return;
    }

    const ok = window.confirm(`Import ${normalized.length} players? This replaces the current roster on this device.`);
    if (ok) setPlayers(normalized);
  };

  if (showSplash) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-white text-[#102A43] fairteams-splash-fade">
        <img src={fairTeamsLogo} alt="Fair Teams" className="w-24 h-24 object-contain mb-3" />
        <h1 className="text-4xl font-black tracking-tight leading-none">
          <span className="text-[#102A43]">FAIR</span><span className="text-[#16A34A]"> TEAMS</span>
        </h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Balanced teams. Better games.</p>
        <div className="mt-6 h-1 w-20 rounded-full bg-[#22C55E]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background w-full max-w-md mx-auto relative shadow-2xl overflow-hidden">
      <header className="px-3 py-2 bg-primary text-primary-foreground flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <img src={fairTeamsLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
          <h1 className="text-lg font-bold leading-none truncate">Fair Teams</h1>
        </div>

        {activeTab === "players" && (
          <div className="flex gap-1 shrink-0">
            <Button variant="secondary" size="icon" className="h-7 w-7" onClick={exportCsv} title="Export Roster" disabled={players.length === 0}>
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button variant="secondary" size="icon" className="h-7 w-7" onClick={() => fileInputRef.current?.click()} title="Import Roster">
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="hidden"
              onChange={async e => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  await importFile(file);
                } catch (error) {
                  alert(error instanceof Error ? error.message : "Import failed.");
                }
              }}
            />
          </div>
        )}
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <div className="sticky top-0 z-20 bg-background border-b border-border px-2 py-1">
          <TabsList className="w-full h-11 bg-muted grid grid-cols-3 rounded-xl p-1 gap-1">
            <TabsTrigger value="players" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5 h-full">
              <Users className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Players</span>
            </TabsTrigger>
            <TabsTrigger value="today" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5 h-full">
              <CalendarCheck className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Today</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg flex items-center justify-center gap-1.5 h-full">
              <Shield className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Teams</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="players" className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50">
            <PlayersTab players={players} setPlayers={replacePlayers} />
          </TabsContent>
          <TabsContent value="today" className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50">
            <TodayTab players={players} setPlayers={replacePlayers} />
          </TabsContent>
          <TabsContent value="teams" className="m-0 data-[state=active]:animate-in data-[state=active]:fade-in-50">
            <TeamsTab players={players} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default App;

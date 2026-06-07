import React, { useMemo, useRef, useState } from "react";
import type { RoomPlayer } from "@/lib/localRoster";
import { calculateOverall, normalizePlayer } from "@/lib/localRoster";
import { Gender } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserMinus, Plus, Star, Zap, Search, X, Camera, Image, Trash2, Pencil, Shield, Footprints, Activity, Dumbbell, Target, Share2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

const STAT_FIELDS = [
  { key: "attack", label: "Attack", icon: Target },
  { key: "defense", label: "Defense", icon: Shield },
  { key: "speed", label: "Speed", icon: Zap },
  { key: "passing", label: "Passing", icon: Share2 },
  { key: "stamina", label: "Stamina", icon: Activity },
  { key: "physical", label: "Strength", icon: Dumbbell },
] as const;

type StatKey = typeof STAT_FIELDS[number]["key"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

function createPlayerId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileToSmallDataUrl(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This photo format is not supported by the browser. Try a JPG or PNG."));
    img.src = dataUrl;
  });

  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  const minSide = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sx = ((image.naturalWidth || image.width) - minSide) / 2;
  const sy = ((image.naturalHeight || image.height) - minSide) / 2;
  ctx.drawImage(image, sx, sy, minSide, minSide, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function PlayerAvatar({ player, size = "md" }: { player: RoomPlayer; size?: "sm" | "md" | "lg" | "xl" }) {
  const cls = size === "xl" ? "w-12 h-12 text-sm" : size === "lg" ? "w-24 h-24 text-2xl" : size === "sm" ? "w-9 h-9 text-xs" : "w-12 h-12 text-sm";
  return (
    <div className={`${cls} rounded-full overflow-hidden bg-primary/10 text-primary font-black flex items-center justify-center shrink-0 border border-primary/20`}>
      {player.profilePhoto ? <img src={player.profilePhoto} alt="" className="w-full h-full object-cover" /> : initials(player.name)}
    </div>
  );
}


function GKBadge() {
  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800 border border-emerald-200">GK</span>;
}

function ORGBadge() {
  return <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-black text-orange-800 border border-orange-200">ORG</span>;
}

function StatControl({ label, value, max = 10, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</Label>
        <span className="text-xs font-black text-primary">{value}{max === 3 ? "" : max === 5 ? "★" : ""}</span>
      </div>
      <input
        type="range"
        min={1}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function PlayerRadar({ player }: { player: RoomPlayer }) {
  const data = useMemo(() => [
    { stat: "Attack", value: player.attack },
    { stat: "Passing", value: player.passing },
    { stat: "Stamina", value: player.stamina },
    { stat: "Defense", value: player.defense },
    { stat: "Strength", value: player.physical },
    { stat: "Speed", value: player.speed },
  ], [player]);

  return (
    <div className="h-52 w-full bg-muted/40 rounded-xl border border-border p-2">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid />
          <PolarAngleAxis dataKey="stat" tick={{ fontSize: 10, fontWeight: 700 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProfileDialog({ player, onUpdate }: { player: RoomPlayer; onUpdate: (data: Partial<RoomPlayer>) => void }) {
  const [draft, setDraft] = useState<RoomPlayer>(() => normalizePlayer(player));
  const [open, setOpen] = useState(false);
  const photoCameraInput = useRef<HTMLInputElement | null>(null);
  const photoGalleryInput = useRef<HTMLInputElement | null>(null);
  const overall = calculateOverall(draft);

  const updateDraft = (data: Partial<RoomPlayer>) => {
    setDraft(prev => normalizePlayer({ ...prev, ...data }));
  };

  const save = () => {
    onUpdate({ ...draft, skill: overall });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setDraft(normalizePlayer(player)); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="w-8 h-8 rounded-full" title="Edit player" data-testid={`profile-${player.id}`}>
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit player profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => photoGalleryInput.current?.click()} className="relative group">
              <PlayerAvatar player={draft} size="lg" />
              <span className="absolute inset-0 bg-slate-900/35 rounded-full text-white hidden group-hover:flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </span>
            </button>
            <div className="flex-1 space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Name</Label>
              <Input value={draft.name} onChange={e => updateDraft({ name: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => photoCameraInput.current?.click()}>
                  <Camera className="w-3.5 h-3.5 mr-1" /> Take Photo
                </Button>
                <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => photoGalleryInput.current?.click()}>
                  <Image className="w-3.5 h-3.5 mr-1" /> Gallery
                </Button>
                {draft.profilePhoto && <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => updateDraft({ profilePhoto: undefined })}><Trash2 className="w-3.5 h-3.5 mr-1" /> Remove</Button>}
              </div>
              <input
                ref={photoCameraInput}
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try { updateDraft({ profilePhoto: await fileToSmallDataUrl(file) }); }
                  catch { alert("Could not load that photo."); }
                }}
              />
              <input
                ref={photoGalleryInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try { updateDraft({ profilePhoto: await fileToSmallDataUrl(file) }); }
                  catch { alert("Could not load that photo."); }
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Gender</Label>
              <Select value={draft.gender} onValueChange={v => updateDraft({ gender: v as Gender })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl bg-primary text-primary-foreground p-3 flex flex-col justify-center">
              <span className="text-[10px] uppercase font-bold opacity-70">Overall</span>
              <span className="text-3xl font-black leading-none">{overall}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 cursor-pointer">
              <Checkbox
                checked={!!draft.isGoalkeeper}
                onCheckedChange={checked => updateDraft({ isGoalkeeper: checked === true })}
                className="w-4 h-4 rounded border-2"
              />
              <span className="text-sm font-bold flex-1">Goalkeeper</span>
              <GKBadge />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 cursor-pointer">
              <Checkbox
                checked={!!draft.isOrganizer}
                onCheckedChange={checked => updateDraft({ isOrganizer: checked === true })}
                className="w-4 h-4 rounded border-2"
              />
              <span className="text-sm font-bold flex-1">Organizer</span>
              <ORGBadge />
            </label>
          </div>

          <PlayerRadar player={{ ...draft, skill: overall }} />

          <div className="grid grid-cols-2 gap-3">
            {STAT_FIELDS.map(({ key, label }) => (
              <StatControl key={key} label={label} value={draft[key]} onChange={value => updateDraft({ [key]: value } as Partial<RoomPlayer>)} />
            ))}
          </div>

          <div className="rounded-xl border border-border p-3 bg-muted/40">
            <StatControl label="Team Play" max={3} value={draft.teamPlay} onChange={value => updateDraft({ teamPlay: value })} />
            <p className="text-[10px] text-muted-foreground mt-1">1 = low · 2 = average · 3 = high</p>
          </div>

          <Button onClick={save} className="h-11 font-black uppercase">Save Profile</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverallBadge({ player }: { player: RoomPlayer }) {
  return (
    <div className="w-12 h-10 rounded-xl bg-primary/10 text-primary border border-primary/15 flex flex-col items-center justify-center shrink-0 shadow-sm">
      <span className="text-[7px] font-bold uppercase opacity-70 leading-none">OVR</span>
      <span className="text-lg font-black leading-none">{player.skill}</span>
    </div>
  );
}

export function PlayersTab({ players, setPlayers }: { players: RoomPlayer[]; setPlayers: (players: RoomPlayer[]) => void }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("male");
  const [isGoalkeeper, setIsGoalkeeper] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [addPhoto, setAddPhoto] = useState<string | undefined>(undefined);
  const addPhotoCameraInput = useRef<HTMLInputElement | null>(null);
  const addPhotoGalleryInput = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");

  const updatePlayer = (playerId: string, data: Partial<RoomPlayer>) => {
    setPlayers(players.map(player => player.id === playerId ? normalizePlayer({ ...player, ...data }) : player));
  };

  const removePlayer = (playerId: string) => {
    setPlayers(players.filter(player => player.id !== playerId));
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPlayers([
      ...players,
      normalizePlayer({
        id: createPlayerId(),
        roomId: 1,
        name: name.trim(),
        gender,
        skill: 5,
        attack: 5,
        defense: 5,
        speed: 5,
        passing: 5,
        stamina: 5,
        physical: 5,
        teamPlay: 2,
        profilePhoto: addPhoto,
        isGoalkeeper,
        isOrganizer,
        attending: false,
        createdAt: new Date().toISOString(),
      }),
    ]);
    setName("");
    setIsGoalkeeper(false);
    setIsOrganizer(false);
    setAddPhoto(undefined);
  };

  const filtered = search.trim()
    ? players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : players;

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Player Name</Label>
              <Input
                id="name"
                placeholder="e.g. Mike"
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-12 font-medium"
                data-testid="input-player-name"
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <button type="button" onClick={() => addPhotoGalleryInput.current?.click()} className="shrink-0">
                <div className="w-14 h-14 rounded-full overflow-hidden bg-primary/10 text-primary font-black flex items-center justify-center border border-primary/20">
                  {addPhoto ? <img src={addPhoto} alt="" className="w-full h-full object-cover" /> : <Camera className="w-5 h-5" />}
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Player Photo</p>
                <p className="text-[11px] text-muted-foreground">Optional — take a quick photo or choose from gallery.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-bold" onClick={() => addPhotoCameraInput.current?.click()}>
                    <Camera className="w-3.5 h-3.5 mr-1" /> Take Photo
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-bold" onClick={() => addPhotoGalleryInput.current?.click()}>
                    <Image className="w-3.5 h-3.5 mr-1" /> Gallery
                  </Button>
                  {addPhoto && <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAddPhoto(undefined)}><Trash2 className="w-3.5 h-3.5 mr-1" /> Remove</Button>}
                </div>
                <input
                  ref={addPhotoCameraInput}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="sr-only"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try { setAddPhoto(await fileToSmallDataUrl(file)); }
                    catch { alert("Could not load that photo."); }
                  }}
                />
                <input
                  ref={addPhotoGalleryInput}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try { setAddPhoto(await fileToSmallDataUrl(file)); }
                    catch { alert("Could not load that photo."); }
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender" className="text-xs uppercase font-bold text-muted-foreground tracking-wider">Gender</Label>
              <Select value={gender} onValueChange={v => setGender(v as Gender)}>
                <SelectTrigger className="h-12 font-medium" id="gender" data-testid="select-gender">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-3 cursor-pointer">
                <Checkbox
                  checked={isGoalkeeper}
                  onCheckedChange={checked => setIsGoalkeeper(checked === true)}
                  className="w-4 h-4 rounded border-2"
                  data-testid="checkbox-goalkeeper"
                />
                <span className="text-sm font-bold flex-1">GK</span>
                <GKBadge />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-3 cursor-pointer">
                <Checkbox
                  checked={isOrganizer}
                  onCheckedChange={checked => setIsOrganizer(checked === true)}
                  className="w-4 h-4 rounded border-2"
                  data-testid="checkbox-organizer"
                />
                <span className="text-sm font-bold flex-1">Organizer</span>
                <ORGBadge />
              </label>
            </div>

            <Button type="submit" className="w-full h-12 mt-2 font-bold uppercase tracking-wide" data-testid="button-add-player">
              <Plus className="w-4 h-4 mr-2" /> Add Player
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">New players start as balanced 5 OVR. Tap Profile to add photo, detailed stats, and team play.</p>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Roster</h3>
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs font-bold">
            {search ? `${filtered.length} / ${players.length}` : players.length}
          </span>
        </div>

        {players.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search roster…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-10 pl-9 pr-9 text-sm"
              data-testid="input-search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {players.length === 0 ? (
          <div className="text-center py-10 bg-muted/50 rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium text-sm">No players added yet.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 bg-muted/50 rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium text-sm">No players match "{search}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filtered.map(player => (
              <div key={player.id} className="p-3 bg-card border border-border rounded-xl shadow-sm" data-testid={`player-row-${player.id}`}>
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={player} size="xl" />
                  <div className="min-w-0 flex-1">
                    <div className="font-black leading-tight text-base break-words">{player.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1 min-h-5">
                      {player.isGoalkeeper && <GKBadge />}
                      {player.isOrganizer && <ORGBadge />}
                    </div>
                  </div>
                  <OverallBadge player={player} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2">
                  <div className="flex gap-3 text-[11px] text-muted-foreground font-black tracking-wide">
                    <span>ATK {player.attack}</span><span>DEF {player.defense}</span><span>SPD {player.speed}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProfileDialog player={player} onUpdate={(data) => updatePlayer(player.id, data)} />
                    <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive w-8 h-8 rounded-full" data-testid={`button-remove-${player.id}`}>
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-xs rounded-xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Player?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete {player.name} from the roster.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => removePlayer(player.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

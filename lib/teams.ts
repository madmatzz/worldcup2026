// ESPN abbreviation -> display name + flagcdn country code
// for the 32 teams that qualified for the 2026 knockout stage.
export type TeamInfo = {
  name: string
  flag: string // flagcdn code
}

export const TEAM_INFO: Record<string, TeamInfo> = {
  CAN: { name: 'Canada', flag: 'ca' },
  RSA: { name: 'South Africa', flag: 'za' },
  GER: { name: 'Germany', flag: 'de' },
  PAR: { name: 'Paraguay', flag: 'py' },
  NED: { name: 'Netherlands', flag: 'nl' },
  MAR: { name: 'Morocco', flag: 'ma' },
  BRA: { name: 'Brazil', flag: 'br' },
  JPN: { name: 'Japan', flag: 'jp' },
  FRA: { name: 'France', flag: 'fr' },
  SWE: { name: 'Sweden', flag: 'se' },
  CIV: { name: 'Ivory Coast', flag: 'ci' },
  NOR: { name: 'Norway', flag: 'no' },
  MEX: { name: 'Mexico', flag: 'mx' },
  ECU: { name: 'Ecuador', flag: 'ec' },
  ENG: { name: 'England', flag: 'gb-eng' },
  COD: { name: 'DR Congo', flag: 'cd' },
  USA: { name: 'United States', flag: 'us' },
  BIH: { name: 'Bosnia-Herzegovina', flag: 'ba' },
  BEL: { name: 'Belgium', flag: 'be' },
  SEN: { name: 'Senegal', flag: 'sn' },
  POR: { name: 'Portugal', flag: 'pt' },
  CRO: { name: 'Croatia', flag: 'hr' },
  ESP: { name: 'Spain', flag: 'es' },
  AUT: { name: 'Austria', flag: 'at' },
  SUI: { name: 'Switzerland', flag: 'ch' },
  ALG: { name: 'Algeria', flag: 'dz' },
  ARG: { name: 'Argentina', flag: 'ar' },
  CPV: { name: 'Cape Verde', flag: 'cv' },
  COL: { name: 'Colombia', flag: 'co' },
  GHA: { name: 'Ghana', flag: 'gh' },
  AUS: { name: 'Australia', flag: 'au' },
  EGY: { name: 'Egypt', flag: 'eg' },
}

export function flagUrl(flag: string, size: 80 | 160 = 160) {
  return `https://hatscripts.github.io/circle-flags/flags/${flag}.svg`
}

// --- Shared bracket types (returned by /api/bracket) ---

export type MatchTeam = {
  abbr: string
  name: string
  flag: string
  score: number | null
  pens: number | null
  winner: boolean
}

export type MatchEvent = {
  type: 'goal' | 'yellow' | 'red' | 'penalty-goal' | 'own-goal'
  minute: string        // e.g. "54'" or "90'+2'"
  player: string        // short name e.g. "S. Eustáquio"
  teamId: string        // ESPN team id to match to home/away
}

export type BracketMatch = {
  id: string
  date: string // ISO
  status: 'scheduled' | 'live' | 'finished'
  statusText: string
  home: MatchTeam | null // null = TBD slot
  away: MatchTeam | null
  homeAbbr: string
  awayAbbr: string
  homeDisplayName: string
  awayDisplayName: string
  homeTeamId: string
  awayTeamId: string
  note: string | null // e.g. "Paraguay advance 4-3 on penalties"
  venue: string | null   // e.g. "SoFi Stadium, Inglewood, California"
  events: MatchEvent[]
}

export type BracketData = {
  updatedAt: string // ISO, when the API route fetched
  // rounds[0] = 16 Round-of-32 matches ... rounds[4] = [final]
  rounds: BracketMatch[][]
  champion: MatchTeam | null
}

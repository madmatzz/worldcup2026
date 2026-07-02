// ESPN abbreviation -> display name + flagcdn country code
// for the 32 teams that qualified for the 2026 knockout stage.
export type TeamInfo = {
  name: string
  flag: string // flagcdn code
  colors: string[] // national team colors for confetti
}

export const TEAM_INFO: Record<string, TeamInfo> = {
  CAN: { name: 'Canada', flag: 'ca', colors: ['#FF0000', '#FFFFFF'] },
  RSA: { name: 'South Africa', flag: 'za', colors: ['#007749', '#FFB81C', '#000000', '#DE3831', '#002395'] },
  GER: { name: 'Germany', flag: 'de', colors: ['#000000', '#DD0000', '#FFCC00'] },
  PAR: { name: 'Paraguay', flag: 'py', colors: ['#D52B1E', '#FFFFFF', '#0038A8'] },
  NED: { name: 'Netherlands', flag: 'nl', colors: ['#FF6600', '#FFFFFF', '#21468B'] },
  MAR: { name: 'Morocco', flag: 'ma', colors: ['#C1272D', '#006233'] },
  BRA: { name: 'Brazil', flag: 'br', colors: ['#009C3B', '#FFDF00', '#002776'] },
  JPN: { name: 'Japan', flag: 'jp', colors: ['#BC002D', '#FFFFFF', '#002776'] },
  FRA: { name: 'France', flag: 'fr', colors: ['#002395', '#FFFFFF', '#ED2939'] },
  SWE: { name: 'Sweden', flag: 'se', colors: ['#006AA7', '#FECC00'] },
  CIV: { name: 'Ivory Coast', flag: 'ci', colors: ['#FF8200', '#FFFFFF', '#009A44'] },
  NOR: { name: 'Norway', flag: 'no', colors: ['#EF2B2D', '#FFFFFF', '#002868'] },
  MEX: { name: 'Mexico', flag: 'mx', colors: ['#006341', '#FFFFFF', '#CE1126'] },
  ECU: { name: 'Ecuador', flag: 'ec', colors: ['#FFD100', '#003DA5', '#CE1126'] },
  ENG: { name: 'England', flag: 'gb-eng', colors: ['#FFFFFF', '#CF081F', '#041E42'] },
  COD: { name: 'DR Congo', flag: 'cd', colors: ['#007FFF', '#CE1021', '#F7D618'] },
  USA: { name: 'United States', flag: 'us', colors: ['#B31942', '#FFFFFF', '#0A3161'] },
  BIH: { name: 'Bosnia-Herzegovina', flag: 'ba', colors: ['#002395', '#FECB00', '#FFFFFF'] },
  BEL: { name: 'Belgium', flag: 'be', colors: ['#000000', '#FAE042', '#ED2939'] },
  SEN: { name: 'Senegal', flag: 'sn', colors: ['#00853F', '#FDEF42', '#E31B23'] },
  POR: { name: 'Portugal', flag: 'pt', colors: ['#006600', '#FF0000', '#FFCC00'] },
  CRO: { name: 'Croatia', flag: 'hr', colors: ['#FF0000', '#FFFFFF', '#0051A5'] },
  ESP: { name: 'Spain', flag: 'es', colors: ['#AA151B', '#F1BF00'] },
  AUT: { name: 'Austria', flag: 'at', colors: ['#ED2939', '#FFFFFF'] },
  SUI: { name: 'Switzerland', flag: 'ch', colors: ['#FF0000', '#FFFFFF'] },
  ALG: { name: 'Algeria', flag: 'dz', colors: ['#006233', '#FFFFFF', '#D21034'] },
  ARG: { name: 'Argentina', flag: 'ar', colors: ['#74ACDF', '#FFFFFF', '#F6B40E'] },
  CPV: { name: 'Cape Verde', flag: 'cv', colors: ['#003893', '#CF2027', '#F7D116'] },
  COL: { name: 'Colombia', flag: 'co', colors: ['#FCD116', '#003893', '#CE1126'] },
  GHA: { name: 'Ghana', flag: 'gh', colors: ['#CE1126', '#FCD116', '#006B3F'] },
  AUS: { name: 'Australia', flag: 'au', colors: ['#00843D', '#FFCD00', '#002776'] },
  EGY: { name: 'Egypt', flag: 'eg', colors: ['#CE1126', '#FFFFFF', '#000000'] },
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
  clock: string | null
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

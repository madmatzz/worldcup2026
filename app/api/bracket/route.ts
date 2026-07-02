import { NextResponse } from 'next/server'
import {
  TEAM_INFO,
  type BracketData,
  type BracketMatch,
  type MatchEvent,
  type MatchTeam,
} from '@/lib/teams'

const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260720'

// slug -> round index (0 = Round of 32 ... 4 = Final)
function roundIndex(slug: string, isThirdPlace: boolean): number | null {
  if (isThirdPlace) return null
  if (slug.includes('round-of-32')) return 0
  if (slug.includes('round-of-16')) return 1
  if (slug.includes('quarter')) return 2
  if (slug.includes('semi')) return 3
  if (slug.includes('final')) return 4
  return null
}

function parseTeam(competitor: any): MatchTeam | null {
  const abbr: string = competitor?.team?.abbreviation ?? ''
  const info = TEAM_INFO[abbr]
  // Placeholder slots (e.g. "RD32", "QFW1") are not real teams yet
  if (!info) return null
  return {
    abbr,
    name: info.name,
    flag: info.flag,
    score:
      competitor.score != null && competitor.score !== ''
        ? Number(competitor.score)
        : null,
    pens: competitor.shootoutScore ?? null,
    winner: Boolean(competitor.winner),
  }
}

function parseEvents(details: any[]): MatchEvent[] {
  if (!details || !Array.isArray(details)) return []
  return details
    .filter((d) => !d.shootout) // exclude shootout events from the timeline
    .map((d) => {
      let type: MatchEvent['type'] = 'goal'
      if (d.redCard) type = 'red'
      else if (d.yellowCard) type = 'yellow'
      else if (d.penaltyKick && d.scoringPlay) type = 'penalty-goal'
      else if (d.ownGoal) type = 'own-goal'
      else if (d.scoringPlay) type = 'goal'
      else if (!d.scoringPlay && !d.yellowCard && !d.redCard) return null

      const athlete = d.athletesInvolved?.[0]
      return {
        type,
        minute: d.clock?.displayValue ?? '',
        player: athlete?.shortName ?? athlete?.displayName ?? 'Unknown',
        teamId: String(d.team?.id ?? ''),
      } as MatchEvent
    })
    .filter(Boolean) as MatchEvent[]
}

function parseEvent(event: any): { round: number | null; match: BracketMatch } {
  const comp = event.competitions[0]
  const slug: string = event.season?.slug ?? ''
  const name: string = (event.name ?? '').toLowerCase()
  const isThirdPlace =
    slug.includes('third') || name.includes('third place')

  const competitors: any[] = comp.competitors ?? []
  const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
  const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]

  const state: string = comp.status?.type?.state ?? event.status?.type?.state ?? 'pre'
  const status: BracketMatch['status'] =
    state === 'post' ? 'finished' : state === 'in' ? 'live' : 'scheduled'

  const notes: any[] = comp.notes ?? []

  // Build venue string
  const v = comp.venue
  let venue: string | null = null
  if (v) {
    const parts = [v.fullName, v.address?.city, v.address?.country].filter(Boolean)
    venue = parts.join(', ')
  }

  const match: BracketMatch = {
    id: String(event.id),
    date: event.date,
    status,
    statusText:
      comp.status?.type?.description ??
      event.status?.type?.description ??
      'Scheduled',
    clock: state === 'in' ? (comp.status?.displayClock && comp.status.displayClock !== "0:00" ? comp.status.displayClock : comp.status?.type?.shortDetail ?? null) : null,
    home: parseTeam(home),
    away: parseTeam(away),
    homeAbbr: home?.team?.abbreviation ?? '',
    awayAbbr: away?.team?.abbreviation ?? '',
    // Store display names so we can extract explicit match numbers
    // e.g. "Round of 32 12 Winner", "Round of 16 3 Winner", "Quarterfinal 2 Winner"
    homeDisplayName: home?.team?.displayName ?? '',
    awayDisplayName: away?.team?.displayName ?? '',
    homeTeamId: String(home?.team?.id ?? ''),
    awayTeamId: String(away?.team?.id ?? ''),
    note: notes[0]?.headline ?? null,
    venue,
    events: parseEvents(comp.details),
  }
  return { round: roundIndex(slug, isThirdPlace), match }
}

// Round labels used by ESPN in their placeholder display names
const ROUND_DISPLAY_NAMES = [
  'round of 32',
  'round of 16',
  'quarterfinal',
  'semifinal',
]

/**
 * Extracts the child-round match number from an ESPN placeholder display name.
 * e.g. "Round of 32 12 Winner" → 12, "Quarterfinal 2 Winner" → 2
 * Returns null if not a placeholder or can't parse.
 */
function extractFeederMatchNumber(
  displayName: string,
  childRoundLabel: string,
): number | null {
  const lower = displayName.toLowerCase()
  if (!lower.includes(childRoundLabel)) return null
  // Pattern: "<round label> <number> Winner" or "<round label> <number> Loser"
  const regex = new RegExp(
    childRoundLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s+(\\d+)\\s+(?:winner|loser)',
    'i',
  )
  const m = lower.match(regex)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Orders each round so that the two feeder matches of every parent match sit
 * at indices 2i and 2i+1 of the previous round (required for the radial layout).
 *
 * Strategy:
 * 1. For each parent match's home/away slot, try to find the child match by
 *    real team abbreviation (the team must have played in that child match).
 * 2. If the slot is a TBD placeholder (e.g. "Round of 32 12 Winner"), extract
 *    the explicit match number and use it to index into the child round
 *    (sorted chronologically, 1-indexed).
 * 3. Fall back to the next unused chronological match.
 */
function orderRounds(rounds: BracketMatch[][]): BracketMatch[][] {
  const ordered: BracketMatch[][] = []
  ordered[4] = rounds[4]

  for (let r = 4; r >= 1; r--) {
    const parents = ordered[r]
    // Sort child pool by event ID — ESPN match numbers correspond to this order
    const pool = [...rounds[r - 1]].sort(
      (a, b) => Number(a.id) - Number(b.id),
    )
    const used = new Set<string>()
    const next: BracketMatch[] = new Array(parents.length * 2)
    const childRoundLabel = ROUND_DISPLAY_NAMES[r - 1]

    for (let pi = 0; pi < parents.length; pi++) {
      const parent = parents[pi]
      const sides = [
        { team: parent.home, abbr: parent.homeAbbr, displayName: parent.homeDisplayName, slot: pi * 2 },
        { team: parent.away, abbr: parent.awayAbbr, displayName: parent.awayDisplayName, slot: pi * 2 + 1 },
      ]

      // Resolve each side independently, gathering candidates
      const resolved: { slot: number; match: BracketMatch | undefined }[] = []

      for (const side of sides) {
        let child: BracketMatch | undefined

        // 1. If it's a known real team, find the child match they played in
        if (side.team) {
          child = pool.find(
            (m) =>
              !used.has(m.id) &&
              (m.home?.abbr === side.team!.abbr || m.away?.abbr === side.team!.abbr),
          )
        }

        // 2. If still not found, try explicit match number from display name
        if (!child && side.displayName && childRoundLabel) {
          const matchNum = extractFeederMatchNumber(side.displayName, childRoundLabel)
          if (matchNum !== null && matchNum >= 1 && matchNum <= pool.length) {
            const target = pool[matchNum - 1]
            if (!used.has(target.id)) {
              child = target
            }
          }
        }

        resolved.push({ slot: side.slot, match: child })
      }

      // Check for conflict: both sides resolved to the same match
      if (
        resolved[0].match && resolved[1].match &&
        resolved[0].match.id === resolved[1].match.id
      ) {
        // The real-team match takes priority on the side that has the real team
        // The other side should use match-number or fallback
        const side0HasTeam = !!sides[0].team
        const side1HasTeam = !!sides[1].team
        if (side0HasTeam && !side1HasTeam) {
          // Re-resolve side 1 without the conflicting match
          const conflictId = resolved[0].match.id
          let alt: BracketMatch | undefined
          if (sides[1].displayName && childRoundLabel) {
            const matchNum = extractFeederMatchNumber(sides[1].displayName, childRoundLabel)
            if (matchNum !== null && matchNum >= 1 && matchNum <= pool.length) {
              const target = pool[matchNum - 1]
              if (!used.has(target.id) && target.id !== conflictId) alt = target
            }
          }
          if (!alt) alt = pool.find((m) => !used.has(m.id) && m.id !== conflictId)
          resolved[1].match = alt
        } else if (side1HasTeam && !side0HasTeam) {
          const conflictId = resolved[1].match.id
          let alt: BracketMatch | undefined
          if (sides[0].displayName && childRoundLabel) {
            const matchNum = extractFeederMatchNumber(sides[0].displayName, childRoundLabel)
            if (matchNum !== null && matchNum >= 1 && matchNum <= pool.length) {
              const target = pool[matchNum - 1]
              if (!used.has(target.id) && target.id !== conflictId) alt = target
            }
          }
          if (!alt) alt = pool.find((m) => !used.has(m.id) && m.id !== conflictId)
          resolved[0].match = alt
        }
      }

      // Place children and mark used
      for (const { slot, match } of resolved) {
        if (match) {
          used.add(match.id)
          next[slot] = match
        }
      }
    }

    // Fill any remaining empty slots with unused matches (fallback)
    for (let i = 0; i < next.length; i++) {
      if (!next[i]) {
        const fallback = pool.find((m) => !used.has(m.id))
        if (fallback) {
          used.add(fallback.id)
          next[i] = fallback
        }
      }
    }

    ordered[r - 1] = next
  }
  return ordered
}

export async function GET() {
  try {
    const res = await fetch(ESPN_URL, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bracket-app)' },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream responded ${res.status}` },
        { status: 502 },
      )
    }
    const data = await res.json()

    const rounds: BracketMatch[][] = [[], [], [], [], []]
    for (const event of data.events ?? []) {
      const { round, match } = parseEvent(event)
      if (round !== null) rounds[round].push(match)
    }

    // Sanity check: expected 16 / 8 / 4 / 2 / 1
    const expected = [16, 8, 4, 2, 1]
    const valid = rounds.every((r, i) => r.length === expected[i])
    let orderedRounds = valid ? orderRounds(rounds) : rounds

    // --- CUSTOM VISUAL OVERRIDE FOR WORLD CUP MOCK ---
    if (valid) {
      const CUSTOM_R32 = [
        ['BRA', 'JPN'], ['CIV', 'NOR'], ['MEX', 'ECU'], ['ENG', 'COD'],
        ['ARG', 'CPV'], ['AUS', 'EGY'], ['SUI', 'ALG'], ['COL', 'GHA'],
        ['SEN', 'BEL'], ['BIH', 'USA'], ['AUT', 'ESP'], ['CRO', 'POR'],
        ['MAR', 'NED'], ['CAN', 'RSA'], ['SWE', 'FRA'], ['PAR', 'GER']
      ]
      
      const customRounds: BracketMatch[][] = [[], [], [], [], []]
      const pool = [...rounds[0]]
      for (const pair of CUSTOM_R32) {
        const idx = pool.findIndex(m => 
          (m.home?.abbr === pair[0] && m.away?.abbr === pair[1]) ||
          (m.home?.abbr === pair[1] && m.away?.abbr === pair[0])
        )
        if (idx !== -1) {
          const match = pool.splice(idx, 1)[0]
          // Ensure the home/away orientation perfectly matches the visual circle
          if (match.home?.abbr !== pair[0]) {
            const t = match.home; match.home = match.away; match.away = t;
            const tId = match.homeTeamId; match.homeTeamId = match.awayTeamId; match.awayTeamId = tId;
            const tName = match.homeDisplayName; match.homeDisplayName = match.awayDisplayName; match.awayDisplayName = tName;
          }
          customRounds[0].push(match)
        }
      }
      
      // If we successfully found and ordered all 16 matches
      if (customRounds[0].length === 16) {
        // Build rounds 1 to 4 bottom-up to ensure visual lines trace actual ESPN branches.
        // This preserves pre-populated winners in ESPN's mock when they correctly map to our custom tree.
        const originalPools = rounds.map(r => [...r].sort((a,b) => Number(a.id) - Number(b.id)))
        const remainingPools = rounds.map(r => [...r].sort((a,b) => Number(a.id) - Number(b.id)))
        
        for (let r = 1; r < 5; r++) {
          const childRoundLabel = ROUND_DISPLAY_NAMES[r - 1]
          
          for (let i = 0; i < customRounds[r - 1].length / 2; i++) {
            const childHome = customRounds[r - 1][i * 2]
            const childAway = customRounds[r - 1][i * 2 + 1]
            
            const childHomeNum = originalPools[r - 1].findIndex(m => m.id === childHome.id) + 1
            const childAwayNum = originalPools[r - 1].findIndex(m => m.id === childAway.id) + 1
            
            const childTeams = [
              childHome.home?.abbr, childHome.away?.abbr,
              childAway.home?.abbr, childAway.away?.abbr
            ].filter(Boolean)
            
            // Try to find parent by matching BOTH sides (either by explicit match number or actual team)
            const parentIdx = remainingPools[r].findIndex(p => {
               const hNum = extractFeederMatchNumber(p.homeDisplayName, childRoundLabel)
               const aNum = extractFeederMatchNumber(p.awayDisplayName, childRoundLabel)
               
               const hasHomeMatch = (hNum === childHomeNum || hNum === childAwayNum) || (p.home?.abbr && childTeams.includes(p.home.abbr))
               const hasAwayMatch = (aNum === childHomeNum || aNum === childAwayNum) || (p.away?.abbr && childTeams.includes(p.away.abbr))
               
               return hasHomeMatch && hasAwayMatch
            })
            
            let parentMatch: BracketMatch;
            if (parentIdx !== -1) {
               parentMatch = remainingPools[r].splice(parentIdx, 1)[0]
               
               // Swap if necessary to align branches
               const hNum = extractFeederMatchNumber(parentMatch.homeDisplayName, childRoundLabel)
               const aNum = extractFeederMatchNumber(parentMatch.awayDisplayName, childRoundLabel)
               
               let shouldSwap = false;
               if (hNum && aNum) {
                  if (hNum === childAwayNum || aNum === childHomeNum) shouldSwap = true;
               } else {
                  const childHomeTeams = [childHome.home?.abbr, childHome.away?.abbr].filter(Boolean)
                  const childAwayTeams = [childAway.home?.abbr, childAway.away?.abbr].filter(Boolean)
                  if (parentMatch.home?.abbr && childAwayTeams.includes(parentMatch.home.abbr)) shouldSwap = true;
                  else if (parentMatch.away?.abbr && childHomeTeams.includes(parentMatch.away.abbr)) shouldSwap = true;
               }
               
               if (shouldSwap) {
                  const t = parentMatch.home; parentMatch.home = parentMatch.away; parentMatch.away = t;
                  const tId = parentMatch.homeTeamId; parentMatch.homeTeamId = parentMatch.awayTeamId; parentMatch.awayTeamId = tId;
                  const tName = parentMatch.homeDisplayName; parentMatch.homeDisplayName = parentMatch.awayDisplayName; parentMatch.awayDisplayName = tName;
               }
            } else {
               // Fallback: If ESPN's tree is completely incompatible with this pairing,
               // we pick an arbitrary match but MUST CLEAR its teams so they don't randomly show up.
               parentMatch = remainingPools[r].shift()!
               parentMatch = { ...parentMatch, home: null, away: null }
            }
            
            customRounds[r].push(parentMatch)
          }
        }
        orderedRounds = customRounds
      }
    }

    const final = orderedRounds[4][0]
    const champion =
      final?.status === 'finished'
        ? (final.home?.winner ? final.home : final.away?.winner ? final.away : null)
        : null

    const payload: BracketData = {
      updatedAt: new Date().toISOString(),
      rounds: orderedRounds,
      champion,
    }
    return NextResponse.json(payload)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 502 },
    )
  }
}

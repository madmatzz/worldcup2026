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
    // Sort child pool chronologically — ESPN match numbers correspond to this order
    const pool = [...rounds[r - 1]].sort(
      (a, b) => Date.parse(a.date) - Date.parse(b.date),
    )
    const used = new Set<string>()
    const next: BracketMatch[] = []
    const childRoundLabel = ROUND_DISPLAY_NAMES[r - 1] // e.g. for r=1 (R16), child is "round of 32"

    for (const parent of parents) {
      for (const side of [
        { team: parent.home, abbr: parent.homeAbbr, displayName: parent.homeDisplayName },
        { team: parent.away, abbr: parent.awayAbbr, displayName: parent.awayDisplayName },
      ]) {
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
        //    e.g. "Round of 32 12 Winner" → child match #12 in chronological order
        if (!child && side.displayName && childRoundLabel) {
          const matchNum = extractFeederMatchNumber(side.displayName, childRoundLabel)
          if (matchNum !== null && matchNum >= 1 && matchNum <= pool.length) {
            const target = pool[matchNum - 1] // 1-indexed → 0-indexed
            if (!used.has(target.id)) {
              child = target
            }
          }
        }

        // 3. Fallback to next unused chronological match
        if (!child) child = pool.find((m) => !used.has(m.id))

        if (child) {
          used.add(child.id)
          next.push(child)
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
    const orderedRounds = valid ? orderRounds(rounds) : rounds

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

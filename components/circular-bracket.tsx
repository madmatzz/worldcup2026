'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import useSWR from 'swr'
import {
  flagUrl,
  type BracketData,
  type BracketMatch,
  type MatchEvent,
  type MatchTeam,
} from '@/lib/teams'
import { detectLocale, getTranslations, teamName, type Locale } from '@/lib/i18n'

const REFRESH_MS = 60_000
const SIZE = 1000
const CX = SIZE / 2
const CY = SIZE / 2

// radius of each round's ring (round 0 = outer ring of 32 team slots)
const RING_RADII = [440, 348, 262, 182, 108]
// flag circle radius per round
const NODE_RADII = [30, 21, 16, 13, 15]

function polar(angle: number, radius: number) {
  return {
    x: CX + radius * Math.cos(angle),
    y: CY + radius * Math.sin(angle),
  }
}

// angle of slot j in a round with n slots
function slotAngle(j: number, n: number) {
  return ((j + 0.5) / n) * Math.PI * 2 - Math.PI / 2
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load bracket data')
  return res.json() as Promise<BracketData>
}

/** Flatten matches into team slots: rounds[r] has 2^(4-r) matches -> 2^(5-r) slots */
function toSlots(rounds: BracketMatch[][]): (MatchTeam | null)[][] {
  return rounds.map((round) =>
    round.flatMap((m) => [m.home ?? null, m.away ?? null]),
  )
}

function scoreLabel(m: BracketMatch): string | null {
  if (m.status === 'scheduled') return null
  if (m.home?.score == null || m.away?.score == null) return null
  let s = `${m.home.score}\u2013${m.away.score}`
  if (m.home.pens != null && m.away.pens != null) {
    s += ` (${m.home.pens}\u2013${m.away.pens}p)`
  }
  return s
}

function formatKickoff(iso: string, locale: Locale): string {
  const l = locale === 'es' ? 'es-AR' : undefined
  return new Date(iso).toLocaleString(l, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Get a display name for a team, translated */
function displayTeamName(team: MatchTeam | null, locale: Locale, tbd: string): string {
  if (!team) return tbd
  return teamName(locale, team.abbr, team.name)
}

export function CircularBracket() {
  const { data, error, isValidating } = useSWR('/api/bracket', fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const [secondsLeft, setSecondsLeft] = useState(60)
  const [selected, setSelected] = useState<BracketMatch | null>(null)
  const [locale, setLocale] = useState<Locale>('en')

  // detect locale on mount
  useEffect(() => {
    setLocale(detectLocale())
  }, [])

  const t = useMemo(() => getTranslations(locale), [locale])

  // countdown resets whenever fresh data arrives
  useEffect(() => {
    if (data) setSecondsLeft(60)
  }, [data?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const slots = useMemo(() => (data ? toSlots(data.rounds) : null), [data])

  const geometry = useMemo(() => {
    const connectors: string[] = []
    for (let r = 0; r < 4; r++) {
      const n = 2 ** (5 - r)
      const pn = 2 ** (4 - r)
      for (let j = 0; j < n; j++) {
        const childAngle = slotAngle(j, n)
        const parentAngle = slotAngle(Math.floor(j / 2), pn)
        const start = polar(childAngle, RING_RADII[r] - NODE_RADII[r])
        const elbow = polar(childAngle, RING_RADII[r + 1])
        const end = polar(parentAngle, RING_RADII[r + 1])
        connectors.push(
          `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${elbow.x.toFixed(1)} ${elbow.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
        )
      }
    }
    for (let j = 0; j < 2; j++) {
      const a = slotAngle(j, 2)
      const start = polar(a, RING_RADII[4] - NODE_RADII[4])
      connectors.push(`M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${CX} ${CY}`)
    }
    return { connectors }
  }, [])

  const liveCount =
    data?.rounds.flat().filter((m) => m.status === 'live').length ?? 0

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {/* Title */}
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl md:text-5xl font-bold tracking-widest text-foreground">
          {t.pageTitle}
        </h1>
      </header>

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card px-5 py-2">
          <span
            className={`h-2 w-2 rounded-full ${
              error ? 'bg-destructive' : 'animate-pulse bg-green-500'
            }`}
            aria-hidden="true"
          />
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {error && !data ? t.liveDataUnavailable : t.liveData}
          </p>
        </div>
        {liveCount > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-card px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              {t.matchesInPlay(liveCount)}
            </p>
          </div>
        )}
      </div>

      {/* Bracket */}
      <div className="w-full max-w-[720px] overflow-x-auto pb-4">
        <div className="relative min-w-[720px] md:min-w-0">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className={`h-auto w-full transition-opacity duration-500 ${
              !data ? 'opacity-30' : 'opacity-100'
            }`}
            role="img"
            aria-label={locale === 'es'
              ? 'Bracket eliminatorio de la Copa del Mundo 2026, los ganadores avanzan hacia el trofeo en el centro'
              : '2026 World Cup knockout bracket, winners advancing toward the trophy at the center'}
          >
            {/* ring guides + connectors */}
            {RING_RADII.map((r, i) => (
              <circle
                key={i}
                cx={CX}
                cy={CY}
                r={r}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={0.5}
                strokeDasharray="3 5"
              />
            ))}
            {geometry.connectors.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth={0.7}
              />
            ))}

            {data && slots && (
              <>

                {/* team / TBD slots per round */}
                {slots.map((round, ri) =>
                  round.map((team, j) => {
                    const n = round.length
                    const angle = slotAngle(j, n)
                    const p = polar(angle, RING_RADII[ri])
                    const r = NODE_RADII[ri]

                    // match index (2 slots per match)
                    const mi = Math.floor(j / 2)
                    const match = data.rounds[ri][mi]

                    if (!team) {
                      return (
                        <g
                          key={`empty-${ri}-${j}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelected(match)}
                        >
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={r * 0.5}
                            fill="var(--color-muted)"
                            opacity={0.5}
                          />
                          <text
                            x={p.x}
                            y={p.y + 1}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="fill-[var(--color-muted-foreground)]"
                            fontSize={r * 0.7}
                          >
                            ?
                          </text>
                        </g>
                      )
                    }
                    const flag = flagUrl(team.flag, 160)
                    const isSelected = selected?.id === match.id
                    return (
                      <g
                        key={`team-${ri}-${j}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(match)}
                      >
                        {isSelected && (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={r + 3}
                            fill="none"
                            stroke="white"
                            strokeWidth={2}
                          />
                        )}
                        <clipPath id={`clip-${ri}-${j}`}>
                          <circle cx={p.x} cy={p.y} r={r} />
                        </clipPath>
                        <image
                          href={flag}
                          x={p.x - r}
                          y={p.y - r}
                          width={r * 2}
                          height={r * 2}
                          clipPath={`url(#clip-${ri}-${j})`}
                          preserveAspectRatio="xMidYMid slice"
                        >
                          <title>{displayTeamName(team, locale, t.tbd)}</title>
                        </image>
                      </g>
                    )
                  }),
                )}
              </>
            )}
          </svg>

          {/* Center trophy + champion */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <img
              src="https://cdn-img.zerozero.pt/img/logos/edicoes/176026_imgbank_.png"
              alt="World Cup trophy"
              className="h-[13%] w-auto object-contain"
            />
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground md:text-sm">
              {data?.champion ? displayTeamName(data.champion, locale, t.tbd) : t.tbd}
            </p>
          </div>
        </div>
      </div>

      {/* Selected match detail */}
      {selected && (() => {
        const homeEvents = selected.events.filter((e) => e.teamId === selected.homeTeamId)
        const awayEvents = selected.events.filter((e) => e.teamId === selected.awayTeamId)
        return (
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4">
          {/* Header row */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {selected.status === 'live'
                ? t.live
                : selected.status === 'finished'
                  ? selected.statusText
                  : formatKickoff(selected.date, locale)}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t.close}
            </button>
          </div>

          {/* Venue */}
          {selected.venue && (
            <p className="mb-3 text-center text-xs text-muted-foreground">
              📍 {selected.venue}
            </p>
          )}

          {/* Teams + score */}
          <div className="flex items-center justify-between gap-4">
            {[selected.home, selected.away].map((team, i) => (
              <div
                key={i}
                className={`flex flex-1 items-center gap-2 ${i === 1 ? 'flex-row-reverse text-right' : ''}`}
              >
                {team ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={flagUrl(team.flag, 80) || '/placeholder.svg'}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                    <span
                      className={`text-sm ${team.winner ? 'font-bold text-foreground' : 'text-muted-foreground'}`}
                    >
                      {displayTeamName(team, locale, t.tbd)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t.tbd}</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-center font-mono text-2xl font-bold text-foreground tabular-nums">
            {selected.status !== 'scheduled' &&
            selected.home?.score != null &&
            selected.away?.score != null
              ? `${selected.home.score} \u2013 ${selected.away.score}`
              : '\u2013'}
          </p>
          {selected.note && (
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {selected.note}
            </p>
          )}

          {/* Events timeline */}
          {selected.events.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex flex-col gap-1.5">
                {selected.events.map((ev, i) => {
                  const isHome = ev.teamId === selected.homeTeamId
                  const icon =
                    ev.type === 'goal' ? '⚽' :
                    ev.type === 'penalty-goal' ? '⚽ (P)' :
                    ev.type === 'own-goal' ? '⚽ (OG)' :
                    ev.type === 'yellow' ? '🟨' :
                    ev.type === 'red' ? '🟥' : ''
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 text-xs ${isHome ? '' : 'flex-row-reverse text-right'}`}
                    >
                      <span className="w-10 shrink-0 font-mono text-muted-foreground tabular-nums">
                        {ev.minute}
                      </span>
                      <span>{icon}</span>
                      <span className="text-foreground">{ev.player}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* Legend */}
      <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {t.roundLabels.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className="rounded-full bg-muted"
              style={{
                width: `${NODE_RADII[i] * 0.5}px`,
                height: `${NODE_RADII[i] * 0.5}px`,
              }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

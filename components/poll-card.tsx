'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { TEAM_INFO, flagUrl } from '@/lib/teams'
import { getTranslations, type Locale } from '@/lib/i18n'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function PollCard({ eliminatedTeams = new Set<string>(), locale = 'en' }: { eliminatedTeams?: Set<string>, locale?: Locale }) {
  const t = getTranslations(locale)
  const { data, mutate, error } = useSWR<{ votes: Record<string, number> }>('/api/vote', fetcher, {
    refreshInterval: 10000 // refresh every 10s
  })
  
  const [votedFor, setVotedFor] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load vote from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('worldcup_poll_vote')
    if (saved) setVotedFor(saved)
  }, [])

  // Calculate percentages
  const votes = data?.votes || {}
  const totalVotes = Object.values(votes).reduce((a, b) => Number(a) + Number(b), 0)

  const teams = Object.entries(TEAM_INFO)
    .map(([abbr, info]) => {
      const count = Number(votes[abbr] || 0)
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
      const isEliminated = eliminatedTeams.has(abbr)
      return { abbr, count, pct, isEliminated, ...info }
    })
    .sort((a, b) => {
      if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1
      return b.count - a.count || a.name.localeCompare(b.name)
    })

  const handleVote = async (abbr: string) => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamAbbr: abbr, oldTeamAbbr: votedFor })
      })
      if (res.ok) {
        localStorage.setItem('worldcup_poll_vote', abbr)
        setVotedFor(abbr)
        mutate() // refresh data immediately
      } else {
        alert(t.poll.errorAlert)
      }
    } catch (e) {
      console.error(e)
      alert(t.poll.errorAlert)
    } finally {
      setIsSubmitting(false)
    }
  }



  return (
    <div className="mx-auto w-full max-w-4xl">
      <h3 className="mb-2 text-center text-2xl font-bold text-foreground uppercase tracking-wider">
        {t.poll.question}
      </h3>
      <p className="mb-8 text-center text-sm text-muted-foreground max-w-lg mx-auto">
        {t.poll.subtitle}
      </p>

      {error ? (
         <p className="text-sm text-center text-muted-foreground">{t.poll.error}</p>
      ) : (
        <div className="space-y-6">
          {votedFor && (
            <p className="text-sm text-muted-foreground text-center">
              {t.poll.thanks} ({totalVotes} {totalVotes === 1 ? t.poll.vote : t.poll.votes})
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map(team => {
              const isMyVote = team.abbr === votedFor
              return (
                <button
                  key={team.abbr}
                  onClick={() => handleVote(team.abbr)}
                  disabled={isSubmitting || team.isEliminated || isMyVote}
                  className={`group relative flex items-center justify-between p-3 rounded-md border transition-colors text-left overflow-hidden ${
                    isMyVote 
                      ? 'border-primary ring-1 ring-primary shadow-sm' 
                      : 'border-border'
                  } ${!isMyVote && !team.isEliminated ? 'hover:border-primary/50' : ''} ${
                    votedFor !== null && !isMyVote ? 'opacity-70 grayscale-[0.3]' : 'bg-card'
                  } ${team.isEliminated && !isMyVote ? 'opacity-40 grayscale pointer-events-none' : ''} disabled:cursor-default cursor-pointer`}
                >
                  {/* Progress Bar Background */}
                  <div 
                    className={`absolute left-0 top-0 h-full transition-all duration-1000 ease-out ${
                      isMyVote ? 'bg-primary/20' : 'bg-muted'
                    }`}
                    style={{ width: `${team.pct}%` }}
                  />
                  
                  {/* Content */}
                  <div className="relative z-10 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={flagUrl(team.flag, 80) || '/placeholder.svg'} 
                      alt="" 
                      className={`h-6 w-6 rounded-full object-cover shadow-sm shrink-0 ${team.isEliminated ? 'saturate-[0.1]' : ''}`} 
                    />
                    <span className={`font-medium ${isMyVote ? 'text-primary' : team.isEliminated ? 'text-red-500' : 'text-foreground'}`}>
                      {team.name} {isMyVote && <span className="text-xs ml-1 opacity-80">({t.poll.you})</span>}
                    </span>
                  </div>
                  
                  {/* Percentage */}
                  <div className="relative z-10 text-sm font-semibold font-mono">
                    {team.pct}%
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

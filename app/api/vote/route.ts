import { NextResponse } from 'next/server'
import { createClient } from '@vercel/kv'

const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
})

const POLL_KEY = 'worldcup_winner_votes'

export async function GET() {
  try {
    const votes = await kv.hgetall(POLL_KEY) || {}
    return NextResponse.json({ votes })
  } catch (error) {
    console.error('Error fetching votes:', error)
    return NextResponse.json({ votes: {} })
  }
}

export async function POST(request: Request) {
  try {
    const { teamAbbr, oldTeamAbbr } = await request.json()
    if (!teamAbbr) {
      return NextResponse.json({ error: 'Team abbreviation is required' }, { status: 400 })
    }

    if (oldTeamAbbr) {
      await kv.hincrby(POLL_KEY, oldTeamAbbr, -1)
    }

    // Increment vote count for the chosen team
    await kv.hincrby(POLL_KEY, teamAbbr, 1)
    
    // Return updated votes
    const votes = await kv.hgetall(POLL_KEY) || {}
    return NextResponse.json({ votes })
  } catch (error) {
    console.error('Error submitting vote:', error)
    return NextResponse.json({ error: 'Failed to submit vote' }, { status: 500 })
  }
}

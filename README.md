# US Pre-Market Momentum Scanner

Finds US stocks up more than 90% in the pre-market session, classifies each as a
real catalyst / pump / dilution, stores the results in Supabase, and pushes a
Hebrew Telegram alert. Scan and alert only - no trade execution, no portfolio
tracking.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres)
- Anthropic API (catalyst classification, model claude-haiku-4-5)
- Finnhub free tier (company news)
- Telegram Bot (alerts)
- Vercel hosting + cron (backup trigger)

## Triggers
- Manual button on the home page (primary). Calls the scan directly server-side.
- Vercel cron (backup): two UTC schedules (13:00 and 14:00 UTC, Mon-Fri) cover
  09:00 ET across DST. The handler proceeds only when the ET hour is exactly 9
  and no scan exists yet for today's ET date.

## Setup
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in every value.
3. In the Supabase SQL editor, run `supabase/migrations/0001_premarket_scans.sql`.
4. Dev: `npm run dev` (uses `next dev --no-turbopack` for Windows).
5. Tests: `npm test`.

## Verifying the data source in isolation
- Weekend / market closed: `npm run scan:tv` (mechanical mode - drops the
  premarket filter so request, parsing, and column mapping can be checked).
- Trading day, US pre-market: `npm run scan:tv -- --premarket`.

## Environment variables
| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `FINNHUB_API_KEY` | Finnhub free-tier key (about 60 req/min) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Destination chat id (522356436) |
| `CRON_SECRET` | Required as `Authorization: Bearer` on every `/api/scan` call |
| `SEND_EMPTY_ALERTS` | `true`/`false`, default `true` - send a message when zero gappers |

## Cron auth on Vercel
Configure Vercel Cron to send `Authorization: Bearer ${CRON_SECRET}`. The route
rejects any request without it. For precise 09:00 ET timing (Hobby cron drifts
within the hour), use the manual button as the primary trigger or point an
external scheduler (for example cron-job.org) at `/api/scan` with the same
bearer header.

## Notes
- The TradingView endpoint is unofficial and undocumented; using it is against
  TradingView's Terms of Service and it can change without notice. All field
  names live in `lib/config.ts` (`TV_COLUMNS` / `TV_FILTERS`). If a request
  breaks, verify names against the `tradingview-screener` Python library field
  list and update that one file.
- Validate the full flow with the manual button on a weekday during US
  pre-market before relying on the cron.

# Spanish Tutor

A personal Spanish conversation tutor you run on your laptop. Hold a button, speak Spanish, and Sofía (a tutor from Mexico City) answers out loud. She corrects you gently by rephrasing what you said, and when you end the session you get a report with your main mistakes, grammar to study, and vocabulary.

## How it works

1. Your recording goes to **ElevenLabs Scribe** for speech-to-text.
2. **Claude Opus 5.5** (low effort, to keep it quick) writes Sofía's reply.
3. **ElevenLabs** turns the reply into speech and streams it to the browser.
4. In the background, **Claude Haiku 5.5** tags each of your turns for mistakes and vocabulary.
5. At the end, Claude Opus 5.5 writes the session report from the transcript and the tagged mistakes.

Everything is saved in a local SQLite file at `data/tutor.db`.

Claude requests opt into Anthropic's server-side refusal fallback (`fallbacks: "default"`), so a rare safety decline is retried on a fallback model instead of failing the turn.

## Setup

You need Node.js 20 or newer, an Anthropic API key, and an ElevenLabs API key.

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `ANTHROPIC_API_KEY`: from console.anthropic.com
- `ELEVENLABS_API_KEY`: from elevenlabs.io, Profile, API keys
- `ELEVENLABS_VOICE_ID`: in ElevenLabs, open the Voice Library, filter by Spanish and a Mexican accent, add a voice you like to My Voices, then copy its voice ID

Then run:

```bash
npm run dev
```

Open http://localhost:3000 in Chrome, click **Start a conversation**, and allow the microphone.

## Using it

- Hold the **Talk** button (or the spacebar) while you speak, and let go when you're done.
- Holding Talk while Sofía is speaking interrupts her.
- **Repeat** replays her last line.
- **End and get feedback** writes the report. Past sessions and reports are on the home page.

## Rough cost

About $1 per 30-minute session (Claude plus ElevenLabs speech), so roughly $15 to $25 a month at 20 sessions.

## Roadmap

See the plan doc. Next up is Phase 2: spaced-repetition review of the vocabulary and grammar from each session, with Sofía working your weak spots into the next conversation.

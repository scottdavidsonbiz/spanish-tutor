# Spanish Tutor

A personal Spanish conversation tutor you run on your laptop. Sofía leads a spoken conversation hands-free: she talks, listens while you answer, and replies out loud when you pause. Sofía is a tutor from Mexico City. She corrects you gently by rephrasing what you said, and when you end the session you get a report with your main mistakes, grammar to study, and vocabulary.

## How it works

1. The browser listens for your voice and records until you pause. The recording goes to **ElevenLabs Scribe** for speech-to-text.
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

Open http://localhost:3000 in Chrome, click **Start a conversation**, then **Start talking**, and allow the microphone.

## Using it

- Click **Start talking**. Sofía greets you and leads the conversation.
- Just answer out loud. When you pause for about a second and a half, she replies.
- If you say nothing for 15 seconds, she rephrases or changes topic. After two tries with no answer, she pauses.
- **I'm done talking** sends your answer right away, which helps in a noisy room. **Pause**, **Resume** and **Repeat** do what they say.
- **End and get feedback** writes the report. Past sessions and reports are on the home page.

## Rough cost

About $1 per 30-minute session (Claude plus ElevenLabs speech), so roughly $15 to $25 a month at 20 sessions.

## Roadmap

See the plan doc. Next up is Phase 2: spaced-repetition review of the vocabulary and grammar from each session, with Sofía working your weak spots into the next conversation.

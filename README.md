# Mind Bubble

A graphical to-do list. Steps and sub-steps float around a fixed project bubble as physics-driven bubbles you pop when done.

Vue 3 + Vite frontend, Express + SQLite (`node:sqlite`, Node 24+) backend.

## Run

```
npm run install:all
npm run dev
```

Client: http://localhost:5173, API: http://localhost:3123.

## Docker

```
docker build -t mind-bubble .
docker run -d --name mind-bubble -p 3123:3123 -v mind-bubble-data:/data mind-bubble
```

App: http://localhost:3123. The database lives in the `mind-bubble-data` volume (created automatically if missing), mounted at `/data`.

## Configuration

Copy `server/config.example.json` to `server/config.json` and list your machine types. Without it the example file is used.
If the database is empty it is seeded from `EXAMPLE_DATA.json` (if present) or `server/seed.example.json`.

## License

MIT

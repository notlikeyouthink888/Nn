# Live Chess — real-time sharable chess games

This repository contains a minimal live chess prototype: a simple server using Express + Socket.IO and a static client that uses chessboard.js for the UI.

How it works
- Create a game: the creator receives a shareable URL (/game/<id>) and is assigned White.
- Open the URL by a second player: the second player becomes Black (otherwise they join as spectator).
- Moves are sent to the server which validates them using chess.js and then broadcasts the updated position.

To run (on your server)

1. Install dependencies

   npm install

2. Start the server

   npm start

3. Open http://your-server:3000 and click "Create Game" or open a link like /game/<id>

Deployment
- There's a Dockerfile and docker-compose.yml to run the app in a container.

Notes
- This is a simple prototype. The server keeps game state in memory. Add Redis or DB if you need persistence or clustering.
- The server is authoritative for move validation. The client performs immediate UI updates but reverts if the server rejects a move.


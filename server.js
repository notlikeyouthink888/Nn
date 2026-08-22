const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { Chess } = require('chess.js');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// in-memory games: { [id]: { chess: Chess, players: {white: socketId, black: socketId}, sockets: {socketId: color} } }
const games = {};

function makeId() {
  return crypto.randomBytes(6).toString('hex');
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('createGame', (cb) => {
    const id = makeId();
    const chess = new Chess();
    games[id] = { chess, players: { white: socket.id, black: null }, sockets: {} };
    games[id].sockets[socket.id] = 'white';
    socket.join(id);
    const url = `/game/${id}`;
    console.log(`game ${id} created by ${socket.id}`);
    cb && cb({ ok: true, id, url, color: 'white', fen: chess.fen() });
  });

  socket.on('joinGame', (id, cb) => {
    const g = games[id];
    if (!g) {
      cb && cb({ ok: false, error: 'Game not found' });
      return;
    }
    let color = 'spectator';
    if (!g.players.black && g.players.white !== socket.id) {
      g.players.black = socket.id;
      color = 'black';
      g.sockets[socket.id] = 'black';
    } else if (g.players.white === socket.id) {
      color = 'white';
    } else {
      color = 'spectator';
      g.sockets[socket.id] = 'spectator';
    }
    socket.join(id);
    console.log(`${socket.id} joined game ${id} as ${color}`);
    cb && cb({ ok: true, id, color, fen: g.chess.fen(), pgn: g.chess.pgn() });

    // notify others about new player
    io.to(id).emit('presence', { players: g.players });
  });

  socket.on('makeMove', (data, cb) => {
    // data: { id, from, to, promotion? }
    const { id, from, to, promotion } = data;
    const g = games[id];
    if (!g) {
      cb && cb({ ok: false, error: 'Game not found' });
      return;
    }
    const move = { from, to };
    if (promotion) move.promotion = promotion;
    const result = g.chess.move(move);
    if (result) {
      // valid move
      const fen = g.chess.fen();
      const pgn = g.chess.pgn();
      io.to(id).emit('moveMade', { ok: true, from, to, fen, pgn, san: result.san });
      cb && cb({ ok: true, fen, pgn, san: result.san });
    } else {
      cb && cb({ ok: false, error: 'Invalid move' });
    }
  });

  socket.on('disconnect', () => {
    // remove player from any games
    for (const id of Object.keys(games)) {
      const g = games[id];
      if (g.sockets[socket.id]) {
        const color = g.sockets[socket.id];
        delete g.sockets[socket.id];
        if (g.players.white === socket.id) g.players.white = null;
        if (g.players.black === socket.id) g.players.black = null;
        io.to(id).emit('presence', { players: g.players });
        console.log(`socket ${socket.id} disconnected from game ${id}`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

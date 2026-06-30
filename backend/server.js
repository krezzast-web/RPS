const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'rps_admin_jwt_secret_2024';

app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory active game state machine mapping
const activeGames = new Map();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getRoundWinner(move1, move2) {
  if (move1 === move2) return 'draw';
  if (
    (move1 === 'R' && move2 === 'S') ||
    (move1 === 'P' && move2 === 'R') ||
    (move1 === 'S' && move2 === 'P')
  ) return 'player1';
  return 'player2';
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const token = header.split(' ')[1];
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function broadcastLobbyState() {
  try {
    const roomsRes = await db.query(
      `SELECT r.id, r.name, r.price, r.fee, r.status,
              (CASE WHEN r.player2_wallet IS NOT NULL THEN 2 ELSE 1 END) as players,
              p1.username as player1_name, p2.username as player2_name
       FROM rooms r
       LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
       LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
       WHERE r.status = 'OPEN' OR r.status = 'PLAYING'`
    );

    const leaderRes = await db.query(
      `SELECT username, rating, wins, losses, draws, sol_balance, wallet_address
       FROM players ORDER BY rating DESC LIMIT 10`
    );

    const statsRes = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM players) as wallets_count,
        (SELECT COUNT(*) FROM rooms WHERE status = 'OPEN' OR status = 'PLAYING') as rooms_count,
        (SELECT COUNT(*) FROM matches) as matches_count,
        (SELECT COUNT(*) FROM giveaways WHERE status = 'ACTIVE') as giveaways_count`
    );

    const generalMsgRes = await db.query(
      `SELECT sender_username as sender, text, likes, to_char(created_at, 'HH24:MI') as time
       FROM messages
       WHERE room_id IS NULL
       ORDER BY created_at ASC LIMIT 20`
    );

    const giveawaysRes = await db.query(
      `SELECT id, title, description, prize_sol, winner_count, status,
              to_char(end_date, 'DD.MM.YYYY') as end_date_formatted,
              end_date
       FROM giveaways
       ORDER BY created_at DESC LIMIT 10`
    );

    const lobbyData = {
      customRooms: roomsRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        players: r.players,
        price: parseFloat(r.price),
        fee: parseFloat(r.fee),
        player1: r.player1_name,
        player2: r.player2_name
      })),
      topRanks: leaderRes.rows.map((p, idx) => {
        const earnings = parseFloat(p.sol_balance) - 47.0;
        return {
          id: idx + 1,
          name: p.username,
          wallet: p.wallet_address,
          rating: p.rating,
          wins: p.wins,
          losses: p.losses,
          draws: p.draws,
          earnings: earnings >= 0 ? `+${earnings.toFixed(2)} SOL` : `${earnings.toFixed(2)} SOL`
        };
      }),
      stats: {
        wallets: parseInt(statsRes.rows[0].wallets_count || 0),
        rooms: parseInt(statsRes.rows[0].rooms_count || 0),
        matches: parseInt(statsRes.rows[0].matches_count || 0),
        giveaways: parseInt(statsRes.rows[0].giveaways_count || 0)
      },
      giveaways: giveawaysRes.rows,
      chatMessages: generalMsgRes.rows
    };

    io.to('lobby').emit('lobby_update', lobbyData);
  } catch (err) {
    console.error('Error broadcasting lobby state:', err.message);
  }
}

// ─────────────────────────────────────────────
// WebSocket Events
// ─────────────────────────────────────────────

io.on('connection', (socket) => {
  let userWallet = '';
  let currentRoomId = '';

  socket.on('join_lobby', async (wallet) => {
    if (!wallet) return;
    userWallet = wallet;
    socket.join('lobby');

    const defaultUsername = `Player_${wallet.substring(0, 6)}`;
    try {
      await db.query(
        `INSERT INTO players (wallet_address, username, rating, sol_balance)
         VALUES ($1, $2, 1000, 47.0)
         ON CONFLICT (wallet_address) DO UPDATE SET last_active = NOW()`,
        [wallet, defaultUsername]
      );

      const playerRes = await db.query(
        'SELECT username, rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1',
        [wallet]
      );
      socket.emit('profile_sync', {
        username: playerRes.rows[0].username,
        rating: playerRes.rows[0].rating,
        solBalance: parseFloat(playerRes.rows[0].sol_balance),
        wins: playerRes.rows[0].wins,
        losses: playerRes.rows[0].losses,
        draws: playerRes.rows[0].draws
      });

      broadcastLobbyState();
    } catch (err) {
      console.error('Lobby joining database error:', err.message);
    }
  });

  socket.on('create_room', async ({ roomName, betAmount, hasPassword, roomPassword }) => {
    if (!userWallet) return;
    const roomId = `room_${Date.now()}`;

    try {
      await db.query(
        `INSERT INTO rooms (id, name, price, fee, status, password, player1_wallet)
         VALUES ($1, $2, $3, 0.1, 'OPEN', $4, $5)`,
        [roomId, roomName.toUpperCase(), parseFloat(betAmount || 0.05), hasPassword ? roomPassword : null, userWallet]
      );

      socket.emit('room_created', roomId);
      broadcastLobbyState();
    } catch (err) {
      console.error('Room creation database error:', err.message);
    }
  });

  socket.on('join_room', async ({ roomId, password }) => {
    if (!userWallet) return;

    try {
      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
      if (roomRes.rows.length === 0) {
        socket.emit('join_error', 'Room does not exist');
        return;
      }

      const room = roomRes.rows[0];
      if (room.password && room.password !== password && room.player1_wallet !== userWallet) {
        socket.emit('join_error', 'Incorrect password');
        return;
      }

      currentRoomId = roomId;
      socket.join(roomId);
      socket.leave('lobby');

      if (room.player1_wallet !== userWallet && !room.player2_wallet) {
        await db.query(
          "UPDATE rooms SET player2_wallet = $1, status = 'PLAYING' WHERE id = $2",
          [userWallet, roomId]
        );
      }

      const playersRes = await db.query(
        `SELECT r.*,
                p1.username as p1_name, p1.rating as p1_rating, p1.wins as p1_wins, p1.losses as p1_losses, p1.draws as p1_draws,
                p2.username as p2_name, p2.rating as p2_rating, p2.wins as p2_wins, p2.losses as p2_losses, p2.draws as p2_draws
         FROM rooms r
         LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
         LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
         WHERE r.id = $1`,
        [roomId]
      );

      const pData = playersRes.rows[0];

      if (!activeGames.has(roomId)) {
        activeGames.set(roomId, {
          player1Wallet: pData.player1_wallet,
          player2Wallet: pData.player2_wallet,
          player1Ready: false,
          player2Ready: false,
          player1Move: null,
          player2Move: null,
          roundNum: 1,
          player1Score: 0,
          player2Score: 0,
          history1: [],
          history2: [],
          timer: null
        });
      } else {
        const game = activeGames.get(roomId);
        if (!game.player2Wallet && pData.player2_wallet) {
          game.player2Wallet = pData.player2_wallet;
        }
      }

      const game = activeGames.get(roomId);

      const roomSyncData = {
        roomId,
        title: pData.name,
        price: parseFloat(pData.price),
        fee: parseFloat(pData.fee),
        status: pData.status,
        player1: {
          wallet: pData.player1_wallet,
          name: pData.p1_name,
          rating: pData.p1_rating,
          wins: pData.p1_wins,
          losses: pData.p1_losses,
          draws: pData.p1_draws,
          history: game.history1
        },
        player2: pData.player2_wallet ? {
          wallet: pData.player2_wallet,
          name: pData.p2_name,
          rating: pData.p2_rating,
          wins: pData.p2_wins,
          losses: pData.p2_losses,
          draws: pData.p2_draws,
          history: game.history2
        } : null,
        roundNum: game.roundNum,
        player1Score: game.player1Score,
        player2Score: game.player2Score,
        matchmakingState: pData.player2_wallet ? 'opponent_joined' : 'waiting_for_opponent'
      };

      io.to(roomId).emit('room_sync', roomSyncData);
      broadcastLobbyState();
    } catch (err) {
      console.error('Room joining database error:', err.message);
    }
  });

  socket.on('set_ready', () => {
    if (!currentRoomId) return;
    const game = activeGames.get(currentRoomId);
    if (!game) return;

    if (userWallet === game.player1Wallet) game.player1Ready = true;
    else if (userWallet === game.player2Wallet) game.player2Ready = true;

    if (game.player1Ready && game.player2Ready) {
      io.to(currentRoomId).emit('timer_sync', { timerType: 'cooldown_3s', percent: 100, remaining: 3 });

      let countdown = 3;
      if (game.timer) clearInterval(game.timer);

      game.timer = setInterval(() => {
        countdown--;
        io.to(currentRoomId).emit('timer_sync', {
          timerType: 'cooldown_3s',
          percent: (countdown / 3) * 100,
          remaining: countdown
        });

        if (countdown <= 0) {
          clearInterval(game.timer);
          io.to(currentRoomId).emit('start_round', { roundNum: game.roundNum });
          startRoundTimer(currentRoomId);
        }
      }, 1000);
    } else {
      io.to(currentRoomId).emit('ready_status', {
        player1Ready: game.player1Ready,
        player2Ready: game.player2Ready
      });
    }
  });

  function startRoundTimer(roomId) {
    const game = activeGames.get(roomId);
    if (!game) return;

    let seconds = 10;
    io.to(roomId).emit('timer_sync', { timerType: 'playing_10s', percent: 100, remaining: seconds });

    if (game.timer) clearInterval(game.timer);

    game.timer = setInterval(() => {
      seconds--;
      io.to(roomId).emit('timer_sync', {
        timerType: 'playing_10s',
        percent: (seconds / 10) * 100,
        remaining: seconds
      });

      if (seconds <= 0) {
        clearInterval(game.timer);
        resolveRoundAFK(roomId);
      }
    }, 1000);
  }

  socket.on('submit_move', (move) => {
    if (!currentRoomId) return;
    const game = activeGames.get(currentRoomId);
    if (!game) return;

    if (userWallet === game.player1Wallet) game.player1Move = move;
    else if (userWallet === game.player2Wallet) game.player2Move = move;

    socket.emit('move_locked');

    if (game.player1Move && game.player2Move) {
      clearInterval(game.timer);
      resolveRound(currentRoomId);
    }
  });

  async function resolveRound(roomId) {
    const game = activeGames.get(roomId);
    if (!game) return;

    const move1 = game.player1Move;
    const move2 = game.player2Move;
    const winner = getRoundWinner(move1, move2);

    game.history1.unshift(move1);
    game.history2.unshift(move2);

    try {
      const roomRes = await db.query('SELECT price, fee FROM rooms WHERE id = $1', [roomId]);
      const { price, fee } = roomRes.rows[0];
      const stake = parseFloat(price);
      const feeRate = parseFloat(fee);
      const feeAmount = stake * feeRate;

      let winnerWallet = null;

      if (winner === 'player1') {
        game.player1Score++;
        winnerWallet = game.player1Wallet;
        await db.query(
          'UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2',
          [stake - feeAmount, game.player1Wallet]
        );
        await db.query(
          'UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = sol_balance - $1 WHERE wallet_address = $2',
          [stake, game.player2Wallet]
        );
      } else if (winner === 'player2') {
        game.player2Score++;
        winnerWallet = game.player2Wallet;
        await db.query(
          'UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = sol_balance - $1 WHERE wallet_address = $2',
          [stake, game.player1Wallet]
        );
        await db.query(
          'UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2',
          [stake - feeAmount, game.player2Wallet]
        );
      } else {
        await db.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player1Wallet]);
        await db.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player2Wallet]);
      }

      // Record the match in DB for real stats
      await db.query(
        `INSERT INTO matches (room_id, player1_wallet, player2_wallet, winner_wallet, player1_move, player2_move, stake, fee)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [roomId, game.player1Wallet, game.player2Wallet, winnerWallet, move1, move2, stake, feeAmount]
      );

      io.to(roomId).emit('round_resolved', {
        player1Move: move1,
        player2Move: move2,
        player1Score: game.player1Score,
        player2Score: game.player2Score,
        winner,
        roundNum: game.roundNum
      });

      const p1Profile = await db.query(
        'SELECT rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1',
        [game.player1Wallet]
      );
      const p2Profile = await db.query(
        'SELECT rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1',
        [game.player2Wallet]
      );

      io.to(roomId).emit('profile_sync_update', {
        player1: {
          wallet: game.player1Wallet,
          rating: p1Profile.rows[0].rating,
          solBalance: parseFloat(p1Profile.rows[0].sol_balance),
          wins: p1Profile.rows[0].wins,
          losses: p1Profile.rows[0].losses,
          draws: p1Profile.rows[0].draws
        },
        player2: {
          wallet: game.player2Wallet,
          rating: p2Profile.rows[0].rating,
          solBalance: parseFloat(p2Profile.rows[0].sol_balance),
          wins: p2Profile.rows[0].wins,
          losses: p2Profile.rows[0].losses,
          draws: p2Profile.rows[0].draws
        }
      });

      game.player1Move = null;
      game.player2Move = null;
      game.roundNum++;

      setTimeout(() => {
        io.to(roomId).emit('start_round', { roundNum: game.roundNum });
        startRoundTimer(roomId);
      }, 3500);

    } catch (err) {
      console.error('Error resolving round in database:', err.message);
    }
  }

  async function resolveRoundAFK(roomId) {
    const game = activeGames.get(roomId);
    if (!game) return;

    const noMove1 = !game.player1Move;
    const noMove2 = !game.player2Move;

    if (noMove1 && noMove2) {
      io.to(roomId).emit('round_resolved', {
        player1Move: null, player2Move: null,
        player1Score: game.player1Score, player2Score: game.player2Score,
        winner: 'draw', roundNum: game.roundNum
      });
    } else if (noMove1) {
      game.player2Score++;
      io.to(roomId).emit('round_resolved', {
        player1Move: null, player2Move: game.player2Move,
        player1Score: game.player1Score, player2Score: game.player2Score,
        winner: 'player2', roundNum: game.roundNum
      });
    } else if (noMove2) {
      game.player1Score++;
      io.to(roomId).emit('round_resolved', {
        player1Move: game.player1Move, player2Move: null,
        player1Score: game.player1Score, player2Score: game.player2Score,
        winner: 'player1', roundNum: game.roundNum
      });
    }

    game.player1Move = null;
    game.player2Move = null;
    game.roundNum++;

    setTimeout(() => {
      io.to(roomId).emit('start_round', { roundNum: game.roundNum });
      startRoundTimer(roomId);
    }, 3500);
  }

  socket.on('send_chat', async ({ roomId, text }) => {
    if (!userWallet) return;
    try {
      const playerRes = await db.query('SELECT username FROM players WHERE wallet_address = $1', [userWallet]);
      if (!playerRes.rows[0]) return;
      const username = playerRes.rows[0].username;

      await db.query(
        'INSERT INTO messages (sender_username, sender_wallet, room_id, text) VALUES ($1, $2, $3, $4)',
        [username, userWallet, roomId || null, text]
      );

      const msgData = {
        id: Date.now(),
        sender: username,
        senderWallet: userWallet,
        text,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        likes: 0
      };

      if (roomId) {
        io.to(roomId).emit('chat_broadcast', { ...msgData, tab: 'opponent' });
      } else {
        io.to('lobby').emit('chat_broadcast', { ...msgData, tab: 'general' });
      }
    } catch (err) {
      console.error('Error saving chat message:', err.message);
    }
  });

  socket.on('leave_room', async () => {
    if (!currentRoomId) return;
    socket.leave(currentRoomId);
    socket.join('lobby');

    try {
      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoomId]);
      if (roomRes.rows.length > 0) {
        const room = roomRes.rows[0];
        if (room.player1_wallet === userWallet) {
          if (room.player2_wallet) {
            await db.query(
              "UPDATE rooms SET player1_wallet = player2_wallet, player2_wallet = NULL, status = 'OPEN' WHERE id = $1",
              [currentRoomId]
            );
          } else {
            await db.query('DELETE FROM rooms WHERE id = $1', [currentRoomId]);
            activeGames.delete(currentRoomId);
          }
        } else if (room.player2_wallet === userWallet) {
          await db.query(
            "UPDATE rooms SET player2_wallet = NULL, status = 'OPEN' WHERE id = $1",
            [currentRoomId]
          );
        }
      }
      currentRoomId = '';
      broadcastLobbyState();
    } catch (err) {
      console.error('Leave room database error:', err.message);
    }
  });

  socket.on('disconnect', async () => {
    if (currentRoomId) {
      const game = activeGames.get(currentRoomId);
      if (game && game.timer) clearInterval(game.timer);

      try {
        const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoomId]);
        if (roomRes.rows.length > 0) {
          const room = roomRes.rows[0];
          if (room.player1_wallet === userWallet) {
            if (room.player2_wallet) {
              await db.query(
                "UPDATE rooms SET player1_wallet = player2_wallet, player2_wallet = NULL, status = 'OPEN' WHERE id = $1",
                [currentRoomId]
              );
            } else {
              await db.query('DELETE FROM rooms WHERE id = $1', [currentRoomId]);
              activeGames.delete(currentRoomId);
            }
          } else if (room.player2_wallet === userWallet) {
            await db.query(
              "UPDATE rooms SET player2_wallet = NULL, status = 'OPEN' WHERE id = $1",
              [currentRoomId]
            );
          }
        }
      } catch (err) {
        console.error('Disconnect room update error:', err.message);
      }
    }
    broadcastLobbyState();
  });
});

// ─────────────────────────────────────────────
// Admin REST API
// ─────────────────────────────────────────────

// Seed admin account on startup (idempotent)
async function seedAdmin() {
  try {
    const existing = await db.query('SELECT id FROM admins WHERE username = $1', ['admin']);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('RpsAdmin2024!', 12);
      await db.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', ['admin', hash]);
      console.log('Admin account seeded: admin / RpsAdmin2024!');
    }
  } catch (err) {
    console.error('Admin seeding failed:', err.message);
  }
}

if (require.main === module) {
  setTimeout(seedAdmin, 2000); // wait for DB init before seeding admin
}

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ adminId: result.rows[0].id, username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/admin/stats', adminAuth, async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM players) as total_wallets,
        (SELECT COUNT(*) FROM rooms) as total_rooms,
        (SELECT COUNT(*) FROM rooms WHERE status = 'OPEN' OR status = 'PLAYING') as active_rooms,
        (SELECT COUNT(*) FROM matches) as total_matches,
        (SELECT COALESCE(SUM(fee), 0) FROM matches) as total_fees_collected,
        (SELECT COUNT(*) FROM giveaways WHERE status = 'ACTIVE') as active_giveaways
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/players', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const sort = req.query.sort || 'rating';
    const allowed = ['rating', 'wins', 'losses', 'sol_balance', 'last_active', 'username'];
    const sortCol = allowed.includes(sort) ? sort : 'rating';
    const result = await db.query(
      `SELECT wallet_address, username, rating, wins, losses, draws, sol_balance,
              to_char(last_active, 'DD Mon YYYY HH24:MI') as last_active
       FROM players ORDER BY ${sortCol} DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const count = await db.query('SELECT COUNT(*) FROM players');
    res.json({ players: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/rooms', adminAuth, async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT r.id, r.name, r.status, r.price, r.fee,
             to_char(r.created_at, 'DD Mon YYYY HH24:MI') as created_at,
             p1.username as player1, p2.username as player2
      FROM rooms r
      LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
      LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
      ORDER BY r.created_at DESC LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/messages', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await db.query(
      `SELECT sender_username, sender_wallet, room_id, text, likes,
              to_char(created_at, 'DD Mon YYYY HH24:MI') as created_at
       FROM messages ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/matches', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await db.query(
      `SELECT m.id, m.room_id, m.player1_move, m.player2_move, m.stake, m.fee,
              to_char(m.played_at, 'DD Mon YYYY HH24:MI') as played_at,
              p1.username as player1, p2.username as player2, pw.username as winner
       FROM matches m
       LEFT JOIN players p1 ON m.player1_wallet = p1.wallet_address
       LEFT JOIN players p2 ON m.player2_wallet = p2.wallet_address
       LEFT JOIN players pw ON m.winner_wallet = pw.wallet_address
       ORDER BY m.played_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Giveaways CRUD
app.get('/api/admin/giveaways', adminAuth, async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, description, prize_sol, winner_count, status,
              to_char(end_date, 'DD.MM.YYYY') as end_date_str,
              to_char(created_at, 'DD Mon YYYY') as created_at
       FROM giveaways ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/giveaways', adminAuth, async (req, res) => {
  const { title, description, prize_sol, winner_count, end_date } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO giveaways (title, description, prize_sol, winner_count, end_date, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING *`,
      [title, description || '', prize_sol || 0, winner_count || 1, end_date || null]
    );
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/giveaways/:id', adminAuth, async (req, res) => {
  const { title, description, prize_sol, winner_count, end_date, status } = req.body;
  try {
    const result = await db.query(
      `UPDATE giveaways SET title=$1, description=$2, prize_sol=$3, winner_count=$4, end_date=$5, status=$6
       WHERE id=$7 RETURNING *`,
      [title, description || '', prize_sol || 0, winner_count || 1, end_date || null, status || 'ACTIVE', req.params.id]
    );
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/giveaways/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM giveaways WHERE id = $1', [req.params.id]);
    broadcastLobbyState();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Health & Static
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const clientDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(clientDistPath));

app.get('*', (_req, res) => {
  const fs = require('fs');
  if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    res.status(404).send('Build the frontend first.');
  }
});

module.exports = server;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RPS Multiplayer server running on Port ${PORT}`);
  });
}

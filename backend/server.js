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
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

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
    req.admin = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function getConfig() {
  const res = await db.query('SELECT key, value FROM platform_config');
  const config = {};
  res.rows.forEach(r => { config[r.key] = r.value; });
  return config;
}

async function broadcastLobbyState() {
  try {
    const [roomsRes, leaderRes, statsRes, generalMsgRes, giveawaysRes, tiersRes, configRes] = await Promise.all([
      db.query(`
        SELECT r.id, r.name, r.price, r.fee, r.status,
               (CASE WHEN r.player2_wallet IS NOT NULL THEN 2 ELSE 1 END) as players,
               p1.username as player1_name, p2.username as player2_name
        FROM rooms r
        LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
        LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
        WHERE r.status = 'OPEN' OR r.status = 'PLAYING'
      `),
      db.query(`
        SELECT username, rating, wins, losses, draws, chips_balance, wallet_address
        FROM players ORDER BY rating DESC, wins DESC LIMIT 10
      `),
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM players) as wallets_count,
          (SELECT COUNT(*) FROM rooms WHERE status = 'OPEN' OR status = 'PLAYING') as rooms_count,
          (SELECT COUNT(*) FROM matches) as matches_count,
          (SELECT COUNT(*) FROM giveaways WHERE status = 'ACTIVE') as giveaways_count,
          (SELECT COALESCE(value,'0') FROM platform_config WHERE key = 'giveaway_pool_chips') as pool_chips,
          (SELECT COALESCE(value,'1000') FROM platform_config WHERE key = 'chips_per_sol') as chips_per_sol
      `),
      db.query(`
        SELECT sender_username as sender, text, likes, to_char(created_at, 'HH24:MI') as time
        FROM messages WHERE room_id IS NULL ORDER BY created_at ASC LIMIT 20
      `),
      db.query(`
        SELECT g.id, g.title, g.description, g.prize_chips, g.winner_count, g.status,
               to_char(g.end_date, 'DD.MM.YYYY') as end_date_formatted, g.end_date,
               (SELECT COALESCE(value,'1000') FROM platform_config WHERE key='chips_per_sol') as chips_per_sol
        FROM giveaways g WHERE g.status = 'ACTIVE' ORDER BY g.created_at DESC LIMIT 10
      `),
      db.query(`SELECT * FROM room_tiers WHERE is_active = TRUE ORDER BY display_order ASC`),
      db.query(`SELECT key, value FROM platform_config`)
    ]);

    const s = statsRes.rows[0];
    const chipsPerSol = parseFloat(s.chips_per_sol || 1000);

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
      topRanks: leaderRes.rows.map((p, idx) => ({
        id: idx + 1,
        name: p.username,
        wallet: p.wallet_address,
        rating: p.rating,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        chips: parseFloat(p.chips_balance).toFixed(0),
        solEquiv: (parseFloat(p.chips_balance) / chipsPerSol).toFixed(3)
      })),
      stats: {
        wallets: parseInt(s.wallets_count || 0),
        rooms: parseInt(s.rooms_count || 0),
        matches: parseInt(s.matches_count || 0),
        giveaways: parseInt(s.giveaways_count || 0),
        poolChips: parseFloat(s.pool_chips || 0),
        poolSol: (parseFloat(s.pool_chips || 0) / chipsPerSol).toFixed(4)
      },
      giveaways: giveawaysRes.rows.map(g => ({
        ...g,
        sol_equiv: (parseFloat(g.prize_chips || 0) / parseFloat(g.chips_per_sol || 1000)).toFixed(4)
      })),
      roomTiers: tiersRes.rows,
      chatMessages: generalMsgRes.rows
    };

    io.to('lobby').emit('lobby_update', lobbyData);
  } catch (err) {
    console.error('Error broadcasting lobby state:', err.message);
  }
}

// ─────────────────────────────────────────────
// WebSocket
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
        `INSERT INTO players (wallet_address, username, rating, chips_balance)
         VALUES ($1, $2, 1000, 0)
         ON CONFLICT (wallet_address) DO UPDATE SET last_active = NOW()`,
        [wallet, defaultUsername]
      );

      const playerRes = await db.query(
        'SELECT username, rating, chips_balance, wins, losses, draws FROM players WHERE wallet_address = $1',
        [wallet]
      );
      const p = playerRes.rows[0];
      socket.emit('profile_sync', {
        username: p.username,
        rating: p.rating,
        chipsBalance: parseFloat(p.chips_balance),
        wins: p.wins,
        losses: p.losses,
        draws: p.draws
      });

      broadcastLobbyState();
    } catch (err) {
      console.error('Lobby join error:', err.message);
    }
  });

  socket.on('create_room', async ({ roomName, betChips, hasPassword, roomPassword }) => {
    if (!userWallet) return;
    const roomId = `room_${Date.now()}`;
    try {
      await db.query(
        `INSERT INTO rooms (id, name, price, fee, status, password, player1_wallet)
         VALUES ($1, $2, $3, 0.02, 'OPEN', $4, $5)`,
        [roomId, roomName.toUpperCase(), parseFloat(betChips || 50), hasPassword ? roomPassword : null, userWallet]
      );
      socket.emit('room_created', roomId);
      broadcastLobbyState();
    } catch (err) {
      console.error('Room creation error:', err.message);
    }
  });

  socket.on('join_room', async ({ roomId, password }) => {
    if (!userWallet) return;
    try {
      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
      if (!roomRes.rows[0]) { socket.emit('join_error', 'Room does not exist'); return; }

      const room = roomRes.rows[0];
      if (room.password && room.password !== password && room.player1_wallet !== userWallet) {
        socket.emit('join_error', 'Incorrect password'); return;
      }

      currentRoomId = roomId;
      socket.join(roomId);
      socket.leave('lobby');

      if (room.player1_wallet !== userWallet && !room.player2_wallet) {
        await db.query("UPDATE rooms SET player2_wallet = $1, status = 'PLAYING' WHERE id = $2", [userWallet, roomId]);
      }

      const playersRes = await db.query(`
        SELECT r.*,
               p1.username as p1_name, p1.rating as p1_rating, p1.wins as p1_wins, p1.losses as p1_losses, p1.draws as p1_draws,
               p2.username as p2_name, p2.rating as p2_rating, p2.wins as p2_wins, p2.losses as p2_losses, p2.draws as p2_draws
        FROM rooms r
        LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
        LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
        WHERE r.id = $1`, [roomId]);

      const pData = playersRes.rows[0];

      if (!activeGames.has(roomId)) {
        activeGames.set(roomId, {
          player1Wallet: pData.player1_wallet, player2Wallet: pData.player2_wallet,
          player1Ready: false, player2Ready: false,
          player1Move: null, player2Move: null,
          roundNum: 1, player1Score: 0, player2Score: 0,
          history1: [], history2: [], timer: null
        });
      } else {
        const game = activeGames.get(roomId);
        if (!game.player2Wallet && pData.player2_wallet) game.player2Wallet = pData.player2_wallet;
      }

      const game = activeGames.get(roomId);
      io.to(roomId).emit('room_sync', {
        roomId, title: pData.name,
        price: parseFloat(pData.price), fee: parseFloat(pData.fee),
        status: pData.status,
        player1: { wallet: pData.player1_wallet, name: pData.p1_name, rating: pData.p1_rating, wins: pData.p1_wins, losses: pData.p1_losses, draws: pData.p1_draws, history: game.history1 },
        player2: pData.player2_wallet ? { wallet: pData.player2_wallet, name: pData.p2_name, rating: pData.p2_rating, wins: pData.p2_wins, losses: pData.p2_losses, draws: pData.p2_draws, history: game.history2 } : null,
        roundNum: game.roundNum, player1Score: game.player1Score, player2Score: game.player2Score,
        matchmakingState: pData.player2_wallet ? 'opponent_joined' : 'waiting_for_opponent'
      });
      broadcastLobbyState();
    } catch (err) {
      console.error('Room join error:', err.message);
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
        io.to(currentRoomId).emit('timer_sync', { timerType: 'cooldown_3s', percent: (countdown / 3) * 100, remaining: countdown });
        if (countdown <= 0) { clearInterval(game.timer); io.to(currentRoomId).emit('start_round', { roundNum: game.roundNum }); startRoundTimer(currentRoomId); }
      }, 1000);
    } else {
      io.to(currentRoomId).emit('ready_status', { player1Ready: game.player1Ready, player2Ready: game.player2Ready });
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
      io.to(roomId).emit('timer_sync', { timerType: 'playing_10s', percent: (seconds / 10) * 100, remaining: seconds });
      if (seconds <= 0) { clearInterval(game.timer); resolveRoundAFK(roomId); }
    }, 1000);
  }

  socket.on('submit_move', (move) => {
    if (!currentRoomId) return;
    const game = activeGames.get(currentRoomId);
    if (!game) return;
    if (userWallet === game.player1Wallet) game.player1Move = move;
    else if (userWallet === game.player2Wallet) game.player2Move = move;
    socket.emit('move_locked');
    if (game.player1Move && game.player2Move) { clearInterval(game.timer); resolveRound(currentRoomId); }
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
      const betChips = parseFloat(price);
      const feeRate = parseFloat(fee);
      const feeChips = betChips * feeRate * 2; // fee from total pot
      const winnerReceives = betChips * 2 - feeChips;

      let winnerWallet = null;

      if (winner === 'player1') {
        game.player1Score++;
        winnerWallet = game.player1Wallet;
        await db.query('UPDATE players SET rating = rating + 25, wins = wins + 1, chips_balance = chips_balance + $1 WHERE wallet_address = $2', [winnerReceives - betChips, game.player1Wallet]);
        await db.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, chips_balance = GREATEST(0, chips_balance - $1) WHERE wallet_address = $2', [betChips, game.player2Wallet]);
      } else if (winner === 'player2') {
        game.player2Score++;
        winnerWallet = game.player2Wallet;
        await db.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, chips_balance = GREATEST(0, chips_balance - $1) WHERE wallet_address = $2', [betChips, game.player1Wallet]);
        await db.query('UPDATE players SET rating = rating + 25, wins = wins + 1, chips_balance = chips_balance + $1 WHERE wallet_address = $2', [winnerReceives - betChips, game.player2Wallet]);
      } else {
        await db.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player1Wallet]);
        await db.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player2Wallet]);
      }

      // Add portion of fee to giveaway pool
      const configRes = await db.query("SELECT value FROM platform_config WHERE key = 'giveaway_pool_rate'");
      const poolRate = parseFloat(configRes.rows[0]?.value || 0.30);
      const poolContribution = feeChips * poolRate;
      await db.query("UPDATE platform_config SET value = CAST(CAST(value AS DECIMAL) + $1 AS TEXT), updated_at = NOW() WHERE key = 'giveaway_pool_chips'", [poolContribution]);

      // Record match
      await db.query(
        `INSERT INTO matches (room_id, player1_wallet, player2_wallet, winner_wallet, player1_move, player2_move, bet_chips, fee_chips)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [roomId, game.player1Wallet, game.player2Wallet, winnerWallet, move1, move2, betChips, feeChips]
      );

      io.to(roomId).emit('round_resolved', {
        player1Move: move1, player2Move: move2,
        player1Score: game.player1Score, player2Score: game.player2Score,
        winner, roundNum: game.roundNum
      });

      const [p1Profile, p2Profile] = await Promise.all([
        db.query('SELECT rating, chips_balance, wins, losses, draws FROM players WHERE wallet_address = $1', [game.player1Wallet]),
        db.query('SELECT rating, chips_balance, wins, losses, draws FROM players WHERE wallet_address = $1', [game.player2Wallet])
      ]);

      io.to(roomId).emit('profile_sync_update', {
        player1: { wallet: game.player1Wallet, rating: p1Profile.rows[0].rating, chipsBalance: parseFloat(p1Profile.rows[0].chips_balance), wins: p1Profile.rows[0].wins, losses: p1Profile.rows[0].losses, draws: p1Profile.rows[0].draws },
        player2: { wallet: game.player2Wallet, rating: p2Profile.rows[0].rating, chipsBalance: parseFloat(p2Profile.rows[0].chips_balance), wins: p2Profile.rows[0].wins, losses: p2Profile.rows[0].losses, draws: p2Profile.rows[0].draws }
      });

      game.player1Move = null;
      game.player2Move = null;
      game.roundNum++;

      setTimeout(() => {
        io.to(roomId).emit('start_round', { roundNum: game.roundNum });
        startRoundTimer(roomId);
      }, 3500);

    } catch (err) {
      console.error('Round resolution error:', err.message);
    }
  }

  async function resolveRoundAFK(roomId) {
    const game = activeGames.get(roomId);
    if (!game) return;
    const noMove1 = !game.player1Move;
    const noMove2 = !game.player2Move;

    if (noMove1 && noMove2) {
      io.to(roomId).emit('round_resolved', { player1Move: null, player2Move: null, player1Score: game.player1Score, player2Score: game.player2Score, winner: 'draw', roundNum: game.roundNum });
    } else if (noMove1) {
      game.player2Score++;
      io.to(roomId).emit('round_resolved', { player1Move: null, player2Move: game.player2Move, player1Score: game.player1Score, player2Score: game.player2Score, winner: 'player2', roundNum: game.roundNum });
    } else if (noMove2) {
      game.player1Score++;
      io.to(roomId).emit('round_resolved', { player1Move: game.player1Move, player2Move: null, player1Score: game.player1Score, player2Score: game.player2Score, winner: 'player1', roundNum: game.roundNum });
    }

    game.player1Move = null; game.player2Move = null; game.roundNum++;
    setTimeout(() => { io.to(roomId).emit('start_round', { roundNum: game.roundNum }); startRoundTimer(roomId); }, 3500);
  }

  socket.on('send_chat', async ({ roomId, text }) => {
    if (!userWallet) return;
    try {
      const playerRes = await db.query('SELECT username FROM players WHERE wallet_address = $1', [userWallet]);
      if (!playerRes.rows[0]) return;
      const username = playerRes.rows[0].username;
      await db.query('INSERT INTO messages (sender_username, sender_wallet, room_id, text) VALUES ($1, $2, $3, $4)', [username, userWallet, roomId || null, text]);
      const msgData = { id: Date.now(), sender: username, senderWallet: userWallet, text, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), likes: 0 };
      if (roomId) io.to(roomId).emit('chat_broadcast', { ...msgData, tab: 'opponent' });
      else io.to('lobby').emit('chat_broadcast', { ...msgData, tab: 'general' });
    } catch (err) {
      console.error('Chat error:', err.message);
    }
  });

  socket.on('leave_room', async () => {
    if (!currentRoomId) return;
    socket.leave(currentRoomId); socket.join('lobby');
    try {
      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoomId]);
      if (roomRes.rows[0]) {
        const room = roomRes.rows[0];
        if (room.player1_wallet === userWallet) {
          if (room.player2_wallet) await db.query("UPDATE rooms SET player1_wallet = player2_wallet, player2_wallet = NULL, status = 'OPEN' WHERE id = $1", [currentRoomId]);
          else { await db.query('DELETE FROM rooms WHERE id = $1', [currentRoomId]); activeGames.delete(currentRoomId); }
        } else if (room.player2_wallet === userWallet) {
          await db.query("UPDATE rooms SET player2_wallet = NULL, status = 'OPEN' WHERE id = $1", [currentRoomId]);
        }
      }
      currentRoomId = '';
      broadcastLobbyState();
    } catch (err) {
      console.error('Leave room error:', err.message);
    }
  });

  socket.on('disconnect', async () => {
    if (currentRoomId) {
      const game = activeGames.get(currentRoomId);
      if (game && game.timer) clearInterval(game.timer);
      try {
        const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [currentRoomId]);
        if (roomRes.rows[0]) {
          const room = roomRes.rows[0];
          if (room.player1_wallet === userWallet) {
            if (room.player2_wallet) await db.query("UPDATE rooms SET player1_wallet = player2_wallet, player2_wallet = NULL, status = 'OPEN' WHERE id = $1", [currentRoomId]);
            else { await db.query('DELETE FROM rooms WHERE id = $1', [currentRoomId]); activeGames.delete(currentRoomId); }
          } else if (room.player2_wallet === userWallet) {
            await db.query("UPDATE rooms SET player2_wallet = NULL, status = 'OPEN' WHERE id = $1", [currentRoomId]);
          }
        }
      } catch (err) {
        console.error('Disconnect error:', err.message);
      }
    }
    broadcastLobbyState();
  });
});

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const playerRes = await db.query(
      'SELECT wallet_address, username, rating, wins, losses, draws, chips_balance, last_active FROM players WHERE wallet_address = $1',
      [wallet]
    );
    if (!playerRes.rows[0]) return res.status(404).json({ error: 'Player not found' });

    const matchesRes = await db.query(
      `SELECT m.*, p1.username as p1_name, p2.username as p2_name
       FROM matches m
       LEFT JOIN players p1 ON m.player1_wallet = p1.wallet_address
       LEFT JOIN players p2 ON m.player2_wallet = p2.wallet_address
       WHERE m.player1_wallet = $1 OR m.player2_wallet = $1
       ORDER BY m.played_at DESC LIMIT 20`, [wallet]
    );

    const rankRes = await db.query(
      'SELECT COUNT(*) + 1 as rank FROM players WHERE chips_balance > (SELECT chips_balance FROM players WHERE wallet_address = $1)',
      [wallet]
    );

    const config = await getConfig();
    const p = playerRes.rows[0];

    res.json({
      ...p,
      chips_balance: parseFloat(p.chips_balance),
      sol_equivalent: (parseFloat(p.chips_balance) / parseFloat(config.chips_per_sol || 1000)).toFixed(4),
      rank: parseInt(rankRes.rows[0].rank),
      recent_matches: matchesRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile/username', async (req, res) => {
  const { wallet, username } = req.body;
  if (!wallet || !username || username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  try {
    await db.query('UPDATE players SET username = $1 WHERE wallet_address = $2', [username.trim(), wallet]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config/deposit-tiers', async (_req, res) => {
  try {
    const config = await getConfig();
    const chipsPerSol = parseFloat(config.chips_per_sol || 1000);
    const depositFee = parseFloat(config.deposit_fee_rate || 0.03);
    const tiers = [
      { sol: 0.1,  baseChips: 0.1  * chipsPerSol, bonusPct: 0.00 },
      { sol: 0.5,  baseChips: 0.5  * chipsPerSol, bonusPct: 0.05 },
      { sol: 1.0,  baseChips: 1.0  * chipsPerSol, bonusPct: 0.10 },
      { sol: 2.5,  baseChips: 2.5  * chipsPerSol, bonusPct: 0.18 },
      { sol: 5.0,  baseChips: 5.0  * chipsPerSol, bonusPct: 0.25 },
      { sol: 10.0, baseChips: 10.0 * chipsPerSol, bonusPct: 0.35 },
    ].map(t => ({
      sol: t.sol,
      totalChips: Math.round(t.baseChips * (1 + t.bonusPct)),
      bonusPct: Math.round(t.bonusPct * 100),
      feeChips: Math.round(t.baseChips * depositFee)
    }));
    res.json({
      tiers,
      chipsPerSol,
      depositFee,
      withdrawFee: parseFloat(config.withdraw_fee_rate || 0.05),
      platformWallet: config.platform_wallet_address || 'CONFIGURE_YOUR_PLATFORM_WALLET_ADDRESS_HERE'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Withdrawal request — logged as PENDING for admin to process
app.post('/api/withdraw/request', async (req, res) => {
  const { wallet, chipsAmount } = req.body;
  if (!wallet || !chipsAmount || chipsAmount < 100) {
    return res.status(400).json({ error: 'Minimum withdrawal is 100 CHIPS' });
  }
  try {
    const config = await getConfig();
    const chipsPerSol = parseFloat(config.chips_per_sol || 1000);
    const withdrawFee = parseFloat(config.withdraw_fee_rate || 0.05);
    const feeChips = Math.round(chipsAmount * withdrawFee);
    const netChips = chipsAmount - feeChips;
    const solAmount = netChips / chipsPerSol;

    const playerRes = await db.query('SELECT chips_balance FROM players WHERE wallet_address = $1', [wallet]);
    if (!playerRes.rows[0]) return res.status(404).json({ error: 'Player not found' });
    if (parseFloat(playerRes.rows[0].chips_balance) < chipsAmount) {
      return res.status(400).json({ error: 'Insufficient CHIPS balance' });
    }

    // Reserve the chips immediately
    await db.query('UPDATE players SET chips_balance = chips_balance - $1 WHERE wallet_address = $2', [chipsAmount, wallet]);

    await db.query(
      `INSERT INTO transactions (wallet_address, type, chips_amount, sol_amount, fee_chips, status, notes)
       VALUES ($1, 'WITHDRAW', $2, $3, $4, 'PENDING', $5)`,
      [wallet, chipsAmount, solAmount, feeChips, `Withdraw ${chipsAmount} CHIPS → ${solAmount.toFixed(4)} SOL (fee: ${feeChips} CHIPS)`]
    );

    res.json({ success: true, chipsAmount, feeChips, netChips, solAmount: solAmount.toFixed(4), message: 'Withdrawal request submitted. Processing within 24 hours.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// Admin REST API
// ─────────────────────────────────────────────

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
  setTimeout(seedAdmin, 2000);
}

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
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
    const [main, config] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM players) as total_wallets,
          (SELECT COUNT(*) FROM rooms) as total_rooms,
          (SELECT COUNT(*) FROM rooms WHERE status = 'OPEN' OR status = 'PLAYING') as active_rooms,
          (SELECT COUNT(*) FROM matches) as total_matches,
          (SELECT COALESCE(SUM(fee_chips),0) FROM matches) as total_fees_chips,
          (SELECT COUNT(*) FROM transactions WHERE type = 'WITHDRAW' AND status = 'PENDING') as pending_withdrawals,
          (SELECT COUNT(*) FROM giveaways WHERE status = 'ACTIVE') as active_giveaways
      `),
      db.query('SELECT key, value FROM platform_config')
    ]);
    const cfg = {};
    config.rows.forEach(r => { cfg[r.key] = r.value; });
    res.json({ ...main.rows[0], config: cfg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/players', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const result = await db.query(`SELECT wallet_address, username, rating, wins, losses, draws, chips_balance, to_char(last_active, 'DD Mon YYYY HH24:MI') as last_active FROM players ORDER BY chips_balance DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    const count = await db.query('SELECT COUNT(*) FROM players');
    res.json({ players: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/transactions', adminAuth, async (req, res) => {
  try {
    const status = req.query.status;
    const query = status
      ? `SELECT t.*, p.username FROM transactions t LEFT JOIN players p ON t.wallet_address = p.wallet_address WHERE t.status = $1 ORDER BY t.created_at DESC LIMIT 100`
      : `SELECT t.*, p.username FROM transactions t LEFT JOIN players p ON t.wallet_address = p.wallet_address ORDER BY t.created_at DESC LIMIT 100`;
    const result = await db.query(query, status ? [status] : []);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approve withdrawal — admin manually sends SOL, then marks complete
app.post('/api/admin/transactions/:id/complete', adminAuth, async (req, res) => {
  const { tx_signature } = req.body;
  try {
    await db.query(
      `UPDATE transactions SET status = 'COMPLETED', tx_signature = $1, completed_at = NOW() WHERE id = $2 AND type = 'WITHDRAW'`,
      [tx_signature || 'MANUAL', req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reject withdrawal — refund chips
app.post('/api/admin/transactions/:id/reject', adminAuth, async (req, res) => {
  try {
    const txRes = await db.query('SELECT * FROM transactions WHERE id = $1', [req.params.id]);
    if (!txRes.rows[0]) return res.status(404).json({ error: 'Not found' });
    const tx = txRes.rows[0];
    await db.query('UPDATE players SET chips_balance = chips_balance + $1 WHERE wallet_address = $2', [tx.chips_amount, tx.wallet_address]);
    await db.query("UPDATE transactions SET status = 'REJECTED', completed_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Manual chips credit (for deposits received via wallet)
app.post('/api/admin/credit-chips', adminAuth, async (req, res) => {
  const { wallet, chips, sol, tx_signature, notes } = req.body;
  try {
    await db.query('UPDATE players SET chips_balance = chips_balance + $1 WHERE wallet_address = $2', [chips, wallet]);
    await db.query(
      `INSERT INTO transactions (wallet_address, type, chips_amount, sol_amount, status, tx_signature, notes)
       VALUES ($1, 'DEPOSIT', $2, $3, 'COMPLETED', $4, $5)`,
      [wallet, chips, sol || 0, tx_signature || 'MANUAL', notes || `Manual credit: ${chips} CHIPS`]
    );
    broadcastLobbyState();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/rooms', adminAuth, async (_req, res) => {
  try {
    const result = await db.query(`SELECT r.id, r.name, r.status, r.price, r.fee, to_char(r.created_at, 'DD Mon YYYY HH24:MI') as created_at, p1.username as player1, p2.username as player2 FROM rooms r LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address ORDER BY r.created_at DESC LIMIT 100`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/matches', adminAuth, async (req, res) => {
  try {
    const result = await db.query(`SELECT m.id, m.room_id, m.player1_move, m.player2_move, m.bet_chips, m.fee_chips, to_char(m.played_at,'DD Mon YYYY HH24:MI') as played_at, p1.username as player1, p2.username as player2, pw.username as winner FROM matches m LEFT JOIN players p1 ON m.player1_wallet = p1.wallet_address LEFT JOIN players p2 ON m.player2_wallet = p2.wallet_address LEFT JOIN players pw ON m.winner_wallet = pw.wallet_address ORDER BY m.played_at DESC LIMIT ${parseInt(req.query.limit) || 100}`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/messages', adminAuth, async (req, res) => {
  try {
    const result = await db.query(`SELECT sender_username, sender_wallet, room_id, text, likes, to_char(created_at,'DD Mon YYYY HH24:MI') as created_at FROM messages ORDER BY created_at DESC LIMIT ${parseInt(req.query.limit) || 50}`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Room Tiers CRUD
app.get('/api/admin/room-tiers', adminAuth, async (_req, res) => {
  try {
    res.json((await db.query('SELECT * FROM room_tiers ORDER BY display_order')).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/room-tiers/:id', adminAuth, async (req, res) => {
  const { title, bet_chips, fee_rate, is_ranked, display_order, is_active } = req.body;
  try {
    const result = await db.query(
      `UPDATE room_tiers SET title=$1, bet_chips=$2, fee_rate=$3, is_ranked=$4, display_order=$5, is_active=$6 WHERE id=$7 RETURNING *`,
      [title, bet_chips, fee_rate, is_ranked, display_order, is_active, req.params.id]
    );
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Platform Config
app.get('/api/admin/config', adminAuth, async (_req, res) => {
  try {
    res.json((await db.query('SELECT * FROM platform_config ORDER BY key')).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/config/:key', adminAuth, async (req, res) => {
  const { value } = req.body;
  try {
    await db.query('UPDATE platform_config SET value=$1, updated_at=NOW() WHERE key=$2', [value, req.params.key]);
    broadcastLobbyState();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Giveaways CRUD
app.get('/api/admin/giveaways', adminAuth, async (_req, res) => {
  try {
    res.json((await db.query(`SELECT id, title, description, prize_chips, winner_count, status, to_char(end_date,'DD.MM.YYYY') as end_date_str, to_char(created_at,'DD Mon YYYY') as created_at FROM giveaways ORDER BY created_at DESC`)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/giveaways', adminAuth, async (req, res) => {
  const { title, description, prize_chips, winner_count, end_date } = req.body;
  try {
    const result = await db.query(`INSERT INTO giveaways (title, description, prize_chips, winner_count, end_date, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING *`, [title, description || '', prize_chips || 0, winner_count || 1, end_date || null]);
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/giveaways/:id', adminAuth, async (req, res) => {
  const { title, description, prize_chips, winner_count, end_date, status } = req.body;
  try {
    const result = await db.query(`UPDATE giveaways SET title=$1, description=$2, prize_chips=$3, winner_count=$4, end_date=$5, status=$6 WHERE id=$7 RETURNING *`, [title, description || '', prize_chips || 0, winner_count || 1, end_date || null, status || 'ACTIVE', req.params.id]);
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/giveaways/:id', adminAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM giveaways WHERE id = $1', [req.params.id]);
    broadcastLobbyState();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Distribute giveaway — admin triggers this
app.post('/api/admin/giveaways/:id/distribute', adminAuth, async (req, res) => {
  try {
    const gwRes = await db.query('SELECT * FROM giveaways WHERE id = $1', [req.params.id]);
    if (!gwRes.rows[0]) return res.status(404).json({ error: 'Giveaway not found' });
    const gw = gwRes.rows[0];
    const config = await getConfig();
    const chipsPerSol = parseFloat(config.chips_per_sol || 1000);

    // Pick random eligible winners (played at least 1 match in last 7 days)
    const eligibleRes = await db.query(
      `SELECT DISTINCT p.wallet_address, p.username FROM players p
       JOIN matches m ON (m.player1_wallet = p.wallet_address OR m.player2_wallet = p.wallet_address)
       WHERE m.played_at > NOW() - INTERVAL '7 days'
       ORDER BY RANDOM() LIMIT $1`, [gw.winner_count]
    );

    const winners = eligibleRes.rows;
    const chipsPerWinner = parseFloat(gw.prize_chips) / Math.max(winners.length, 1);

    for (const winner of winners) {
      await db.query('UPDATE players SET chips_balance = chips_balance + $1 WHERE wallet_address = $2', [chipsPerWinner, winner.wallet_address]);
      await db.query(
        `INSERT INTO giveaway_winners (giveaway_id, wallet_address, username, chips_won, sol_equivalent) VALUES ($1, $2, $3, $4, $5)`,
        [gw.id, winner.wallet_address, winner.username, chipsPerWinner, chipsPerWinner / chipsPerSol]
      );
    }

    await db.query("UPDATE giveaways SET status = 'COMPLETED' WHERE id = $1", [gw.id]);
    broadcastLobbyState();

    // Announce to lobby
    io.to('lobby').emit('giveaway_winners', { title: gw.title, winners: winners.map(w => ({ username: w.username, chipsWon: chipsPerWinner })) });

    res.json({ success: true, winnersCount: winners.length, chipsPerWinner });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Giveaway winners history (public)
app.get('/api/giveaway-history', async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT gw.username, gw.chips_won, gw.sol_equivalent, to_char(gw.won_at, 'DD Mon YYYY') as date, g.title
      FROM giveaway_winners gw
      JOIN giveaways g ON gw.giveaway_id = g.id
      ORDER BY gw.won_at DESC LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// Static Files
// ─────────────────────────────────────────────

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

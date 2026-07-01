const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Keypair, Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58').default;
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────────
// Security: Warn loudly if secrets not set via env
// ─────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  WARNING: JWT_SECRET not set in env. Using insecure default. Set it in production!');
  return 'rps_admin_jwt_secret_2024';
})();

const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || (() => {
  console.warn('⚠️  WARNING: WALLET_ENCRYPTION_KEY not set in env. Using insecure default. Set it in production!');
  return 'rps_wallet_key_32bytes_padded!!!';
})();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

// ─────────────────────────────────────────────
// CORS Setup
// ─────────────────────────────────────────────

app.use(cors({
  origin: [ALLOWED_ORIGIN, 'https://rps.flappycat.fun', 'http://localhost:5173', 'http://localhost:4173'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' })); // Limit payload size

// ─────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' }
});
const withdrawLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many withdrawal attempts per hour.' }
});
const verifyShareLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many verify attempts per hour.' }
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts.' }
});

app.use(generalLimiter);

// ─────────────────────────────────────────────
// HTTP Server & Socket.io
// ─────────────────────────────────────────────

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [ALLOWED_ORIGIN, 'https://rps.flappycat.fun', 'http://localhost:5173', 'http://localhost:4173'],
    methods: ['GET', 'POST']
  }
});

const activeGames = new Map();

// ─────────────────────────────────────────────
// Wallet Auth — Nonce/Signature System
// ─────────────────────────────────────────────

const authNonces = new Map(); // wallet -> { nonce, expiresAt }

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

function buildAuthMessage(nonce) {
  return `Sign this message to authenticate with RPS Room.\nNonce: ${nonce}`;
}

// Clean up expired nonces every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [wallet, entry] of authNonces) {
    if (entry.expiresAt < now) authNonces.delete(wallet);
  }
}, 10 * 60 * 1000);

// ─────────────────────────────────────────────
// Encryption helpers for custodial private keys
// ─────────────────────────────────────────────

function encryptSecret(plaintext) {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSecret(ciphertext) {
  const [ivHex, encHex] = ciphertext.split(':');
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// ─────────────────────────────────────────────
// Solana helpers
// ─────────────────────────────────────────────

function getSolanaConnection(rpcUrl) {
  return new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
}

async function getSolBalance(address, rpcUrl) {
  try {
    const connection = getSolanaConnection(rpcUrl);
    const pubkey = new PublicKey(address);
    const lamports = await connection.getBalance(pubkey);
    return lamports / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error('getSolBalance error:', err.message);
    return 0;
  }
}

async function generateCustodialWallet() {
  const keypair = Keypair.generate();
  const address = keypair.publicKey.toString();
  const secretBase64 = Buffer.from(keypair.secretKey).toString('base64');
  return { address, secret: encryptSecret(secretBase64) };
}

async function loadKeypairFromDb(encryptedSecret) {
  const secretBase64 = decryptSecret(encryptedSecret);
  const secretKey = Uint8Array.from(Buffer.from(secretBase64, 'base64'));
  return Keypair.fromSecretKey(secretKey);
}

async function sendSolOnChain(encryptedSecret, toAddress, solAmount, rpcUrl) {
  const keypair = await loadKeypairFromDb(encryptedSecret);
  const connection = getSolanaConnection(rpcUrl);
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(toAddress),
      lamports,
    })
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
  return signature;
}

// ─────────────────────────────────────────────
// Game Logic Helpers
// ─────────────────────────────────────────────

const VALID_MOVES = new Set(['R', 'P', 'S']);

function getRoundWinner(move1, move2) {
  if (move1 === move2) return 'draw';
  if (
    (move1 === 'R' && move2 === 'S') ||
    (move1 === 'P' && move2 === 'R') ||
    (move1 === 'S' && move2 === 'P')
  ) return 'player1';
  return 'player2';
}

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────

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

function walletAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please reconnect your wallet.' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (!decoded.wallet) return res.status(401).json({ error: 'Invalid session token.' });
    req.walletAddress = decoded.wallet;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session. Please reconnect your wallet.' });
  }
}

// ─────────────────────────────────────────────
// Platform Config
// ─────────────────────────────────────────────

async function getConfig() {
  const res = await db.query('SELECT key, value FROM platform_config');
  const config = {};
  res.rows.forEach(r => { config[r.key] = r.value; });
  return config;
}

// ─────────────────────────────────────────────
// Lobby Broadcast
// ─────────────────────────────────────────────

async function broadcastLobbyState() {
  try {
    const [roomsRes, leaderRes, statsRes, generalMsgRes, giveawaysRes, tiersRes] = await Promise.all([
      db.query(`
        SELECT r.id, r.name, r.bet_sol, r.fee_rate, r.status,
               (CASE WHEN r.player2_wallet IS NOT NULL THEN 2 ELSE 1 END) as players,
               p1.username as player1_name, p2.username as player2_name,
               (CASE WHEN r.password IS NOT NULL AND r.password != '' THEN TRUE ELSE FALSE END) as has_password
        FROM rooms r
        LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
        LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
        WHERE r.status = 'OPEN' OR r.status = 'PLAYING'
      `),
      db.query(`
        SELECT username, rating, wins, losses, draws, sol_balance, wallet_address
        FROM players ORDER BY rating DESC, wins DESC LIMIT 10
      `),
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM players) as wallets_count,
          (SELECT COUNT(*) FROM rooms WHERE status = 'OPEN' OR status = 'PLAYING') as rooms_count,
          (SELECT COUNT(*) FROM matches) as matches_count,
          (SELECT COUNT(*) FROM giveaways WHERE status = 'ACTIVE') as giveaways_count,
          (SELECT COALESCE(value,'0') FROM platform_config WHERE key = 'giveaway_pool_sol') as pool_sol,
          (SELECT COALESCE(value,'0') FROM platform_config WHERE key = 'platform_fees_collected_sol') as fees_collected_sol
      `),
      db.query(`
        SELECT sender_username as sender, text, likes, to_char(created_at, 'HH24:MI') as time
        FROM messages WHERE room_id IS NULL ORDER BY created_at ASC LIMIT 20
      `),
      db.query(`
        SELECT g.id, g.title, g.description, g.prize_sol, g.winner_count, g.status,
               to_char(g.end_date, 'DD.MM.YYYY') as end_date_formatted, g.end_date, g.created_at
        FROM giveaways g WHERE g.status = 'ACTIVE' ORDER BY g.created_at DESC LIMIT 10
      `),
      db.query(`
        SELECT rt.*,
               COALESCE((
                 SELECT SUM(CASE WHEN r.player2_wallet IS NOT NULL THEN 2 ELSE 1 END)
                 FROM rooms r
                 WHERE r.id LIKE 'tier_' || rt.id || '\\_%' ESCAPE '\\'
               ), 0) as active_players,
               COALESCE((
                 SELECT COUNT(*)
                 FROM matches m
                 WHERE m.room_id LIKE 'tier_' || rt.id || '\\_%' ESCAPE '\\'
               ), 0) as games_played,
               COALESCE((
                 SELECT COUNT(DISTINCT wallet_address) FROM room_joins rj
                 WHERE rj.room_tier = rt.id
                   AND rj.joined_at >= NOW() - INTERVAL '10 minutes'
               ), 0) / 10.0 as games_per_min,
               (
                 SELECT json_agg(coalesce(mc.cnt, 0))
                 FROM (
                   SELECT gs.m, (
                     SELECT COUNT(DISTINCT wallet_address) FROM room_joins rj2
                     WHERE rj2.room_tier = rt.id
                       AND rj2.joined_at >= NOW() - (gs.m + 1) * INTERVAL '1 minute'
                       AND rj2.joined_at < NOW() - gs.m * INTERVAL '1 minute'
                   ) as cnt
                   FROM generate_series(0, 9) gs(m)
                   ORDER BY gs.m DESC
                 ) mc
               ) as chart_data
        FROM room_tiers rt
        WHERE rt.is_active = TRUE
        ORDER BY rt.display_order ASC
      `)
    ]);

    const s = statsRes.rows[0];

    const lobbyData = {
      customRooms: roomsRes.rows.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        players: r.players,
        betSol: parseFloat(r.bet_sol),
        feeRate: parseFloat(r.fee_rate),
        player1: r.player1_name,
        player2: r.player2_name,
        hasPassword: r.has_password
      })),
      topRanks: leaderRes.rows.map((p, idx) => ({
        id: idx + 1,
        name: p.username,
        wallet: p.wallet_address,
        rating: p.rating,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        solBalance: parseFloat(p.sol_balance || 0).toFixed(4)
      })),
      stats: {
        wallets: parseInt(s.wallets_count || 0),
        rooms: parseInt(s.rooms_count || 0),
        matches: parseInt(s.matches_count || 0),
        giveaways: parseInt(s.giveaways_count || 0),
        poolSol: parseFloat(s.pool_sol || 0).toFixed(4),
        feesCollectedSol: parseFloat(s.fees_collected_sol || 0).toFixed(4)
      },
      giveaways: giveawaysRes.rows,
      roomTiers: tiersRes.rows.map(t => ({
        id: t.id,
        title: t.title,
        tier_type: t.tier_type,
        bet_sol: parseFloat(t.bet_sol),
        fee_rate: parseFloat(t.fee_rate),
        is_ranked: t.is_ranked,
        display_order: t.display_order,
        active_players: parseInt(t.active_players || 0),
        games_played: parseInt(t.games_played || 0),
        games_per_min: parseFloat(t.games_per_min || 0),
        chart_data: t.chart_data || [0,0,0,0,0,0,0,0,0,0]
      })),
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
    socket.join('lobby');
    if (!wallet) {
      broadcastLobbyState();
      return;
    }
    userWallet = wallet;

    const defaultUsername = `Player_${wallet.substring(0, 6)}`;
    try {
      await db.query(
        `INSERT INTO players (wallet_address, username, rating, sol_balance)
         VALUES ($1, $2, 1000, 0)
         ON CONFLICT (wallet_address) DO UPDATE SET last_active = NOW()`,
        [wallet, defaultUsername]
      );

      const playerRes = await db.query(
        'SELECT username, rating, sol_balance, wins, losses, draws, custodial_wallet_address, custodial_wallet_secret, x_username FROM players WHERE wallet_address = $1',
        [wallet]
      );
      const p = playerRes.rows[0];

      let custodialAddress = p.custodial_wallet_address;
      if (!custodialAddress) {
        const { address, secret } = await generateCustodialWallet();
        await db.query(
          'UPDATE players SET custodial_wallet_address = $1, custodial_wallet_secret = $2 WHERE wallet_address = $3',
          [address, secret, wallet]
        );
        custodialAddress = address;
      }

      socket.emit('profile_sync', {
        username: p.username,
        rating: p.rating,
        solBalance: parseFloat(p.sol_balance || 0),
        custodialWallet: custodialAddress,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        xUsername: p.x_username || ''
      });

      broadcastLobbyState();
    } catch (err) {
      console.error('Lobby join error:', err.message);
    }
  });

  socket.on('create_room', async ({ roomName, betSol, feeRate, hasPassword, roomPassword, expirationHours }) => {
    if (!userWallet) return;

    // Validate fee rate on server — minimum 3% for custom rooms
    const cleanFee = parseFloat(feeRate !== undefined ? feeRate : 0.02);
    if (cleanFee < 0.03) {
      socket.emit('create_room_error', 'Custom rooms require a minimum fee rate of 3%.');
      return;
    }

    // Check player balance before creating
    const balCheck = await db.query('SELECT sol_balance FROM players WHERE wallet_address = $1', [userWallet]);
    const playerBalance = parseFloat(balCheck.rows[0]?.sol_balance || 0);
    const betAmount = betSol !== undefined && betSol !== null ? parseFloat(betSol) : 0.01;
    if (playerBalance < betAmount) {
      socket.emit('create_room_error', `Insufficient balance. Need ${betAmount} SOL to create this room. Please deposit first.`);
      return;
    }

    // Cap: max 3 open custom rooms per wallet
    const openRoomsCount = await db.query(
      "SELECT COUNT(*) FROM rooms WHERE player1_wallet = $1 AND status = 'OPEN' AND id LIKE 'room_%'",
      [userWallet]
    );
    if (parseInt(openRoomsCount.rows[0].count) >= 3) {
      socket.emit('create_room_error', 'You already have 3 open custom rooms. Close one before creating another.');
      return;
    }

    const roomId = `room_${Date.now()}`;
    const hours = parseInt(expirationHours || 24);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    try {
      await db.query(
        `INSERT INTO rooms (id, name, bet_sol, fee_rate, status, password, player1_wallet, expires_at)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7)`,
        [roomId, roomName.toUpperCase(), betAmount, cleanFee, hasPassword ? roomPassword : null, userWallet, expiresAt]
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
      let targetRoomId = roomId;

      if (roomId.startsWith('tier_')) {
        const parts = roomId.split('_');
        const tierId = parts[1];

        const tierRes = await db.query('SELECT * FROM room_tiers WHERE id = $1', [tierId]);
        if (!tierRes.rows[0]) {
          socket.emit('join_error', 'Invalid room tier');
          return;
        }
        const tier = tierRes.rows[0];

        const openRoomRes = await db.query(`
          SELECT id FROM rooms
          WHERE status = 'OPEN'
            AND id LIKE $1
            AND player1_wallet != $2
          ORDER BY created_at ASC
          LIMIT 1
        `, [`tier_${tierId}_%`, userWallet]);

        if (openRoomRes.rows[0]) {
          targetRoomId = openRoomRes.rows[0].id;
        } else {
          const myOpenRoomRes = await db.query(`
            SELECT id FROM rooms
            WHERE status = 'OPEN'
              AND id LIKE $1
              AND player1_wallet = $2
            LIMIT 1
          `, [`tier_${tierId}_%`, userWallet]);

          if (myOpenRoomRes.rows[0]) {
            targetRoomId = myOpenRoomRes.rows[0].id;
          } else {
            await db.query(`
              INSERT INTO rooms (id, name, bet_sol, fee_rate, status, player1_wallet)
              VALUES ($1, $2, $3, $4, 'OPEN', $5)
            `, [
              roomId,
              tier.title.toUpperCase(),
              parseFloat(tier.bet_sol),
              parseFloat(tier.fee_rate),
              userWallet
            ]);
            targetRoomId = roomId;
          }
        }
        await db.query('INSERT INTO room_joins (room_tier, wallet_address) VALUES ($1, $2)', [tierId, userWallet]);
      }

      const roomRes = await db.query('SELECT * FROM rooms WHERE id = $1', [targetRoomId]);
      if (!roomRes.rows[0]) { socket.emit('join_error', 'Room does not exist'); return; }

      const room = roomRes.rows[0];

      // Reject if room is expired
      if (room.expires_at && new Date(room.expires_at) < new Date()) {
        socket.emit('join_error', 'This room has expired.');
        return;
      }

      if (room.password && room.password !== password && room.player1_wallet !== userWallet) {
        socket.emit('join_error', 'Incorrect password'); return;
      }

      const playerRes = await db.query('SELECT sol_balance FROM players WHERE wallet_address = $1', [userWallet]);
      const solBalance = parseFloat(playerRes.rows[0]?.sol_balance || 0);
      const betSol = parseFloat(room.bet_sol);
      if (solBalance < betSol) {
        socket.emit('join_error', `Insufficient balance. Need ${betSol} SOL, you have ${solBalance.toFixed(4)} SOL. Please deposit first.`);
        return;
      }

      currentRoomId = targetRoomId;
      socket.join(targetRoomId);
      socket.leave('lobby');

      if (room.player1_wallet !== userWallet && !room.player2_wallet) {
        await db.query("UPDATE rooms SET player2_wallet = $1, status = 'PLAYING' WHERE id = $2", [userWallet, targetRoomId]);
      }

      const playersRes = await db.query(`
        SELECT r.*,
               p1.username as p1_name, p1.rating as p1_rating, p1.wins as p1_wins, p1.losses as p1_losses, p1.draws as p1_draws,
               p2.username as p2_name, p2.rating as p2_rating, p2.wins as p2_wins, p2.losses as p2_losses, p2.draws as p2_draws
        FROM rooms r
        LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address
        LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address
        WHERE r.id = $1`, [targetRoomId]);

      const pData = playersRes.rows[0];

      if (!activeGames.has(targetRoomId)) {
        activeGames.set(targetRoomId, {
          player1Wallet: pData.player1_wallet, player2Wallet: pData.player2_wallet,
          player1Ready: false, player2Ready: false,
          player1Move: null, player2Move: null,
          roundNum: 1, player1Score: 0, player2Score: 0,
          history1: [], history2: [], timer: null,
          readyTimeoutTimer: null
        });
      } else {
        const game = activeGames.get(targetRoomId);
        if (!game.player2Wallet && pData.player2_wallet) game.player2Wallet = pData.player2_wallet;
      }

      const game = activeGames.get(targetRoomId);

      // Start ready-up timeout when both players are in room
      if (pData.player2_wallet && !game.player1Ready && !game.player2Ready) {
        if (game.readyTimeoutTimer) clearTimeout(game.readyTimeoutTimer);
        game.readyTimeoutTimer = setTimeout(async () => {
          // If neither is ready after 5 minutes, close the room
          const currentGame = activeGames.get(targetRoomId);
          if (currentGame && !currentGame.player1Ready && !currentGame.player2Ready) {
            io.to(targetRoomId).emit('room_timeout', { message: 'Room closed: no one readied up in 5 minutes.' });
            await db.query('DELETE FROM rooms WHERE id = $1', [targetRoomId]);
            activeGames.delete(targetRoomId);
            broadcastLobbyState();
          }
        }, 5 * 60 * 1000);
      }

      io.to(targetRoomId).emit('room_sync', {
        roomId: targetRoomId, title: pData.name,
        betSol: parseFloat(pData.bet_sol), feeRate: parseFloat(pData.fee_rate),
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

    // Cancel ready timeout since at least one player is engaging
    if (game.readyTimeoutTimer) {
      clearTimeout(game.readyTimeoutTimer);
      game.readyTimeoutTimer = null;
    }

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
    // Validate move is one of the three valid options
    if (!VALID_MOVES.has(move)) {
      socket.emit('move_error', 'Invalid move. Must be R, P, or S.');
      return;
    }
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

    // Use DB transaction to atomically update all balances
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const roomRes = await client.query('SELECT bet_sol, fee_rate, player1_wallet FROM rooms WHERE id = $1', [roomId]);
      const { bet_sol, fee_rate, player1_wallet: creatorWallet } = roomRes.rows[0];
      const betSol = parseFloat(bet_sol);

      // Read fee rates from platform config
      const config = await getConfig();
      const feeRate = parseFloat(fee_rate); // room-level fee takes precedence
      const feeSol = betSol * 2 * feeRate;
      const winnerReceives = betSol * 2 - feeSol;

      const isCustomRoom = roomId.startsWith('room_');
      let giveawayContribution = 0;
      let platformFee = 0;
      let hostFeeSol = 0;

      if (winner !== 'draw') {
        if (isCustomRoom) {
          const platformShareSol = betSol * 2 * 0.015;
          giveawayContribution = platformShareSol * parseFloat(config.giveaway_pool_rate || 0.30);
          platformFee = platformShareSol - giveawayContribution;
          hostFeeSol = Math.max(0, feeSol - platformShareSol);

          if (hostFeeSol > 0 && creatorWallet) {
            await client.query('UPDATE players SET sol_balance = sol_balance + $1 WHERE wallet_address = $2', [hostFeeSol, creatorWallet]);
          }
        } else {
          const poolRate = parseFloat(config.giveaway_pool_rate || 0.30);
          giveawayContribution = feeSol * poolRate;
          platformFee = feeSol - giveawayContribution;
        }
      }

      let winnerWallet = null;

      if (winner === 'player1') {
        game.player1Score++;
        winnerWallet = game.player1Wallet;
        await client.query('UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2', [winnerReceives - betSol, game.player1Wallet]);
        await client.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = GREATEST(0, sol_balance - $1) WHERE wallet_address = $2', [betSol, game.player2Wallet]);
      } else if (winner === 'player2') {
        game.player2Score++;
        winnerWallet = game.player2Wallet;
        await client.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = GREATEST(0, sol_balance - $1) WHERE wallet_address = $2', [betSol, game.player1Wallet]);
        await client.query('UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2', [winnerReceives - betSol, game.player2Wallet]);
      } else {
        await client.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player1Wallet]);
        await client.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player2Wallet]);
      }

      if (winner !== 'draw') {
        await client.query(
          "UPDATE platform_config SET value = CAST(CAST(value AS DECIMAL) + $1 AS TEXT), updated_at = NOW() WHERE key = 'platform_fees_collected_sol'",
          [platformFee]
        );
        await client.query(
          "UPDATE platform_config SET value = CAST(CAST(value AS DECIMAL) + $1 AS TEXT), updated_at = NOW() WHERE key = 'giveaway_pool_sol'",
          [giveawayContribution]
        );
      }

      await client.query(
        `INSERT INTO matches (room_id, player1_wallet, player2_wallet, winner_wallet, player1_move, player2_move, bet_sol, fee_sol)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [roomId, game.player1Wallet, game.player2Wallet, winnerWallet, move1, move2, betSol, winner !== 'draw' ? feeSol : 0]
      );

      await client.query('COMMIT');

      io.to(roomId).emit('round_resolved', {
        player1Move: move1, player2Move: move2,
        player1Score: game.player1Score, player2Score: game.player2Score,
        winner, roundNum: game.roundNum
      });

      const [p1Profile, p2Profile] = await Promise.all([
        db.query('SELECT rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1', [game.player1Wallet]),
        db.query('SELECT rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1', [game.player2Wallet])
      ]);

      io.to(roomId).emit('profile_sync_update', {
        player1: { wallet: game.player1Wallet, rating: p1Profile.rows[0].rating, solBalance: parseFloat(p1Profile.rows[0].sol_balance), wins: p1Profile.rows[0].wins, losses: p1Profile.rows[0].losses, draws: p1Profile.rows[0].draws },
        player2: { wallet: game.player2Wallet, rating: p2Profile.rows[0].rating, solBalance: parseFloat(p2Profile.rows[0].sol_balance), wins: p2Profile.rows[0].wins, losses: p2Profile.rows[0].losses, draws: p2Profile.rows[0].draws }
      });

      game.player1Move = null;
      game.player2Move = null;
      game.roundNum++;

      setTimeout(() => {
        io.to(roomId).emit('start_round', { roundNum: game.roundNum });
        startRoundTimer(roomId);
      }, 3500);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Round resolution error, rolled back:', err.message);
    } finally {
      client.release();
    }
  }

  async function resolveRoundAFK(roomId) {
    const game = activeGames.get(roomId);
    if (!game) return;
    const noMove1 = !game.player1Move;
    const noMove2 = !game.player2Move;

    // Both AFK — draw, no money moves
    if (noMove1 && noMove2) {
      io.to(roomId).emit('round_resolved', { player1Move: null, player2Move: null, player1Score: game.player1Score, player2Score: game.player2Score, winner: 'draw', roundNum: game.roundNum });
      game.player1Move = null; game.player2Move = null; game.roundNum++;
      setTimeout(() => { io.to(roomId).emit('start_round', { roundNum: game.roundNum }); startRoundTimer(roomId); }, 3500);
      return;
    }

    // One player AFK — use DB transaction to process SOL like a normal round
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const roomRes = await client.query('SELECT bet_sol, fee_rate, player1_wallet FROM rooms WHERE id = $1', [roomId]);
      const { bet_sol, fee_rate, player1_wallet: creatorWallet } = roomRes.rows[0];
      const betSol = parseFloat(bet_sol);
      const feeRate = parseFloat(fee_rate);
      const feeSol = betSol * 2 * feeRate;
      const winnerReceives = betSol * 2 - feeSol;

      let afkWallet, winnerWallet, resolvedWinner;

      if (noMove1) {
        game.player2Score++;
        resolvedWinner = 'player2';
        winnerWallet = game.player2Wallet;
        afkWallet = game.player1Wallet;
      } else {
        game.player1Score++;
        resolvedWinner = 'player1';
        winnerWallet = game.player1Wallet;
        afkWallet = game.player2Wallet;
      }

      // Credit winner, debit AFK player
      await client.query('UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2', [winnerReceives - betSol, winnerWallet]);
      await client.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = GREATEST(0, sol_balance - $1) WHERE wallet_address = $2', [betSol, afkWallet]);

      // Fee distribution
      const config = await getConfig();
      const isCustomRoom = roomId.startsWith('room_');
      let giveawayContribution = 0;
      let platformFee = 0;
      let hostFeeSol = 0;

      if (isCustomRoom) {
        const platformShareSol = betSol * 2 * 0.015;
        giveawayContribution = platformShareSol * parseFloat(config.giveaway_pool_rate || 0.30);
        platformFee = platformShareSol - giveawayContribution;
        hostFeeSol = Math.max(0, feeSol - platformShareSol);
        if (hostFeeSol > 0 && creatorWallet) {
          await client.query('UPDATE players SET sol_balance = sol_balance + $1 WHERE wallet_address = $2', [hostFeeSol, creatorWallet]);
        }
      } else {
        const poolRate = parseFloat(config.giveaway_pool_rate || 0.30);
        giveawayContribution = feeSol * poolRate;
        platformFee = feeSol - giveawayContribution;
      }

      await client.query("UPDATE platform_config SET value = CAST(CAST(value AS DECIMAL) + $1 AS TEXT), updated_at = NOW() WHERE key = 'platform_fees_collected_sol'", [platformFee]);
      await client.query("UPDATE platform_config SET value = CAST(CAST(value AS DECIMAL) + $1 AS TEXT), updated_at = NOW() WHERE key = 'giveaway_pool_sol'", [giveawayContribution]);

      await client.query(
        `INSERT INTO matches (room_id, player1_wallet, player2_wallet, winner_wallet, player1_move, player2_move, bet_sol, fee_sol)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [roomId, game.player1Wallet, game.player2Wallet, winnerWallet, game.player1Move || null, game.player2Move || null, betSol, feeSol]
      );

      await client.query('COMMIT');

      io.to(roomId).emit('round_resolved', {
        player1Move: game.player1Move, player2Move: game.player2Move,
        player1Score: game.player1Score, player2Score: game.player2Score,
        winner: resolvedWinner, roundNum: game.roundNum
      });

      const [p1Profile, p2Profile] = await Promise.all([
        db.query('SELECT rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1', [game.player1Wallet]),
        db.query('SELECT rating, sol_balance, wins, losses, draws FROM players WHERE wallet_address = $1', [game.player2Wallet])
      ]);

      io.to(roomId).emit('profile_sync_update', {
        player1: { wallet: game.player1Wallet, rating: p1Profile.rows[0].rating, solBalance: parseFloat(p1Profile.rows[0].sol_balance), wins: p1Profile.rows[0].wins, losses: p1Profile.rows[0].losses, draws: p1Profile.rows[0].draws },
        player2: { wallet: game.player2Wallet, rating: p2Profile.rows[0].rating, solBalance: parseFloat(p2Profile.rows[0].sol_balance), wins: p2Profile.rows[0].wins, losses: p2Profile.rows[0].losses, draws: p2Profile.rows[0].draws }
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('AFK round resolution error, rolled back:', err.message);
    } finally {
      client.release();
    }

    game.player1Move = null; game.player2Move = null; game.roundNum++;
    setTimeout(() => { io.to(roomId).emit('start_round', { roundNum: game.roundNum }); startRoundTimer(roomId); }, 3500);
  }

  socket.on('send_chat', async ({ roomId, text }) => {
    if (!userWallet) return;
    // Sanitize: trim and cap length
    const cleanText = String(text || '').trim().slice(0, 300);
    if (!cleanText) return;
    try {
      const playerRes = await db.query('SELECT username FROM players WHERE wallet_address = $1', [userWallet]);
      if (!playerRes.rows[0]) return;
      const username = playerRes.rows[0].username;
      const msgRes = await db.query(
        'INSERT INTO messages (sender_username, sender_wallet, room_id, text) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, userWallet, roomId || null, cleanText]
      );
      const msgData = {
        id: msgRes.rows[0]?.id || Date.now(),
        sender: username,
        senderWallet: userWallet,
        text: cleanText,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        likes: 0
      };
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
        const game = activeGames.get(currentRoomId);
        if (game && game.readyTimeoutTimer) clearTimeout(game.readyTimeoutTimer);
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
      if (game && game.readyTimeoutTimer) clearTimeout(game.readyTimeoutTimer);
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
// Auth Endpoints (Nonce/Signature)
// ─────────────────────────────────────────────

// Step 1: Get a nonce to sign
app.get('/api/auth/nonce/:wallet', authLimiter, (req, res) => {
  const { wallet } = req.params;
  if (!wallet) return res.status(400).json({ error: 'Wallet required' });
  const nonce = generateNonce();
  authNonces.set(wallet, { nonce, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 min TTL
  const message = buildAuthMessage(nonce);
  res.json({ nonce, message });
});

// Step 2: Verify signature & receive session JWT
app.post('/api/auth/verify', authLimiter, async (req, res) => {
  const { wallet, signature } = req.body;
  if (!wallet || !signature) return res.status(400).json({ error: 'wallet and signature are required' });

  const stored = authNonces.get(wallet);
  if (!stored || Date.now() > stored.expiresAt) {
    return res.status(401).json({ error: 'Nonce expired or not found. Please request a new one.' });
  }

  const message = buildAuthMessage(stored.nonce);

  try {
    const messageBytes = Buffer.from(message, 'utf8');
    const signatureBytes = Buffer.from(signature, 'base64');
    const pubkeyBytes = bs58.decode(wallet);

    const valid = nacl.sign.detached.verify(
      new Uint8Array(messageBytes),
      new Uint8Array(signatureBytes),
      new Uint8Array(pubkeyBytes)
    );

    if (!valid) return res.status(401).json({ error: 'Signature verification failed. Please reconnect your wallet.' });

    authNonces.delete(wallet); // Consume nonce — one-time use

    const token = jwt.sign({ wallet }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (err) {
    console.error('Signature verify error:', err.message);
    res.status(401).json({ error: 'Signature verification failed: ' + err.message });
  }
});

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  db.query('SELECT 1').then(() => res.json({ status: 'healthy', db: 'connected', timestamp: new Date().toISOString() }))
    .catch(() => res.status(500).json({ status: 'unhealthy', db: 'disconnected' }));
});

app.get('/api/profile/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    const playerRes = await db.query(
      'SELECT wallet_address, username, rating, wins, losses, draws, sol_balance, custodial_wallet_address, x_username, last_active FROM players WHERE wallet_address = $1',
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
      'SELECT COUNT(*) + 1 as rank FROM players WHERE rating > (SELECT rating FROM players WHERE wallet_address = $1)',
      [wallet]
    );

    const p = playerRes.rows[0];
    res.json({
      ...p,
      sol_balance: parseFloat(p.sol_balance || 0),
      rank: parseInt(rankRes.rows[0].rank),
      recent_matches: matchesRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Giveaway winners history (public)
app.get('/api/giveaway-history', async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT gw.username, gw.sol_won, to_char(gw.won_at, 'DD Mon YYYY') as date, g.title
      FROM giveaway_winners gw
      JOIN giveaways g ON gw.giveaway_id = g.id
      ORDER BY gw.won_at DESC LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Deep link: /room/:id redirects to frontend with query param
app.get('/room/:id', (req, res) => {
  res.redirect(`/?room=${req.params.id}`);
});

// ─────────────────────────────────────────────
// Protected Player API (walletAuth required)
// ─────────────────────────────────────────────

app.post('/api/profile/username', walletAuth, async (req, res) => {
  const { wallet, username } = req.body;
  // Ensure the authenticated wallet matches the request
  if (req.walletAddress !== wallet) {
    return res.status(403).json({ error: 'You can only change your own username.' });
  }
  if (!wallet || !username || username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  // Only allow alphanumeric and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
  }
  try {
    await db.query('UPDATE players SET username = $1 WHERE wallet_address = $2', [username.trim(), wallet]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/wallet/info/:wallet', walletAuth, async (req, res) => {
  if (req.walletAddress !== req.params.wallet) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  try {
    const result = await db.query(
      'SELECT custodial_wallet_address, sol_balance FROM players WHERE wallet_address = $1',
      [req.params.wallet]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Player not found' });
    res.json({
      custodialAddress: result.rows[0].custodial_wallet_address,
      solBalance: parseFloat(result.rows[0].sol_balance || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch live on-chain SOL balance and sync to DB using custodial_synced_sol tracking
app.post('/api/wallet/sync-balance', walletAuth, async (req, res) => {
  const { wallet } = req.body;
  if (!wallet || req.walletAddress !== wallet) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  try {
    const config = await getConfig();
    const playerRes = await db.query(
      'SELECT custodial_wallet_address, custodial_synced_sol, sol_balance FROM players WHERE wallet_address = $1', [wallet]
    );
    if (!playerRes.rows[0] || !playerRes.rows[0].custodial_wallet_address) {
      return res.status(404).json({ error: 'Custodial wallet not found' });
    }
    const p = playerRes.rows[0];
    const custodialAddress = p.custodial_wallet_address;
    const onChainBalance = await getSolBalance(custodialAddress, config.sol_rpc_url);
    const lastSynced = parseFloat(p.custodial_synced_sol || 0);

    // Only credit the NEW deposit amount (difference above last known on-chain balance)
    // This prevents re-crediting SOL that was already accounted for via game winnings
    if (onChainBalance > lastSynced) {
      const newDeposit = onChainBalance - lastSynced;
      await db.query(
        'UPDATE players SET sol_balance = sol_balance + $1, custodial_synced_sol = $2 WHERE wallet_address = $3',
        [newDeposit, onChainBalance, wallet]
      );
    }
    // If on-chain < lastSynced: withdrawal happened or loss — do nothing to game balance

    const updated = await db.query('SELECT sol_balance FROM players WHERE wallet_address = $1', [wallet]);
    res.json({ solBalance: parseFloat(updated.rows[0].sol_balance), custodialAddress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Withdraw SOL — protected and rate limited
app.post('/api/withdraw', walletAuth, withdrawLimiter, async (req, res) => {
  const { wallet, solAmount } = req.body;
  if (req.walletAddress !== wallet) {
    return res.status(403).json({ error: 'You can only withdraw your own funds.' });
  }
  const minWithdraw = 0.001;
  if (!wallet || !solAmount || parseFloat(solAmount) < minWithdraw) {
    return res.status(400).json({ error: `Minimum withdrawal is ${minWithdraw} SOL` });
  }
  try {
    const config = await getConfig();
    // Read withdraw fee from config (with fallback)
    const withdrawFeeRate = parseFloat(config.withdraw_fee_rate || 0.01);

    const playerRes = await db.query(
      'SELECT sol_balance, custodial_wallet_address, custodial_wallet_secret, custodial_synced_sol FROM players WHERE wallet_address = $1',
      [wallet]
    );
    if (!playerRes.rows[0]) return res.status(404).json({ error: 'Player not found' });

    const p = playerRes.rows[0];
    const amount = parseFloat(solAmount);
    const fee = amount * withdrawFeeRate;
    const netAmount = amount - fee;
    const balance = parseFloat(p.sol_balance || 0);

    if (balance < amount) {
      return res.status(400).json({ error: `Insufficient balance. You have ${balance.toFixed(4)} SOL.` });
    }

    // Deduct from DB immediately (prevent double-spend) + update custodial_synced_sol
    await db.query(
      'UPDATE players SET sol_balance = sol_balance - $1, custodial_synced_sol = GREATEST(0, custodial_synced_sol - $1) WHERE wallet_address = $2',
      [amount, wallet]
    );

    const txRow = await db.query(
      `INSERT INTO transactions (wallet_address, type, sol_amount, fee_sol, status, notes)
       VALUES ($1, 'WITHDRAW', $2, $3, 'PENDING', $4) RETURNING id`,
      [wallet, amount, fee, `Withdraw ${amount} SOL (fee ${fee.toFixed(6)} SOL) → ${wallet}`]
    );

    try {
      const signature = await sendSolOnChain(p.custodial_wallet_secret, wallet, netAmount, config.sol_rpc_url);
      await db.query(
        "UPDATE transactions SET status = 'COMPLETED', tx_signature = $1, completed_at = NOW() WHERE id = $2",
        [signature, txRow.rows[0].id]
      );
      await db.query(
        "UPDATE platform_config SET value = CAST(CAST(value AS DECIMAL) + $1 AS TEXT), updated_at = NOW() WHERE key = 'platform_fees_collected_sol'",
        [fee]
      );
      res.json({ success: true, solAmount: netAmount.toFixed(6), fee: fee.toFixed(6), signature });
    } catch (sendErr) {
      // Rollback balance if send fails
      await db.query(
        'UPDATE players SET sol_balance = sol_balance + $1, custodial_synced_sol = custodial_synced_sol + $1 WHERE wallet_address = $2',
        [amount, wallet]
      );
      await db.query("UPDATE transactions SET status = 'FAILED', notes = $1 WHERE id = $2", [sendErr.message, txRow.rows[0].id]);
      res.status(500).json({ error: 'On-chain transfer failed: ' + sendErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Link Twitter (X) Account — with uniqueness check
app.post('/api/wallet/link-x', walletAuth, async (req, res) => {
  const { wallet, xUsername } = req.body;
  if (req.walletAddress !== wallet) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  if (!wallet || !xUsername) {
    return res.status(400).json({ error: 'Missing wallet or X username' });
  }
  const cleanHandle = xUsername.trim().replace(/^@/, ''); // strip @ if included
  if (!/^[a-zA-Z0-9_]{1,50}$/.test(cleanHandle)) {
    return res.status(400).json({ error: 'Invalid X username format.' });
  }
  try {
    // Check if this X username is already linked to another wallet
    const existing = await db.query(
      'SELECT wallet_address FROM players WHERE x_username = $1 AND wallet_address != $2',
      [cleanHandle, wallet]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'This X username is already linked to another wallet.' });
    }
    await db.query('UPDATE players SET x_username = $1 WHERE wallet_address = $2', [cleanHandle, wallet]);
    res.json({ success: true, xUsername: cleanHandle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify Twitter share for Giveaway Entry — auth + active check + time check
app.post('/api/giveaways/:id/verify-share', walletAuth, verifyShareLimiter, async (req, res) => {
  const { wallet, tweetUrl } = req.body;
  if (req.walletAddress !== wallet) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const giveawayId = req.params.id;
  if (!wallet || !tweetUrl) {
    return res.status(400).json({ error: 'Missing wallet or Tweet URL' });
  }
  try {
    // Check giveaway exists and is still ACTIVE
    const gwRes = await db.query('SELECT * FROM giveaways WHERE id = $1', [giveawayId]);
    if (!gwRes.rows[0]) return res.status(404).json({ error: 'Giveaway not found.' });
    const gw = gwRes.rows[0];
    if (gw.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'This giveaway is no longer active.' });
    }

    const playerRes = await db.query('SELECT x_username FROM players WHERE wallet_address = $1', [wallet]);
    const xUsername = playerRes.rows[0]?.x_username;
    if (!xUsername) {
      return res.status(400).json({ error: 'Please link your Twitter (X) account first' });
    }

    // Fetch Tweet from Twitter oEmbed API
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}`;
    const oembedRes = await fetch(oembedUrl);
    if (!oembedRes.ok) {
      return res.status(400).json({ error: 'Failed to fetch tweet details. Make sure the URL is correct and public.' });
    }
    const oembedData = await oembedRes.json();
    const tweetHtml = oembedData.html || '';

    // Check tweet mentions the platform
    const hasPlatform = tweetHtml.toLowerCase().includes('rps') || tweetHtml.toLowerCase().includes('rpsroom');
    const hasUser = tweetHtml.toLowerCase().includes(`twitter.com/${xUsername.toLowerCase()}`) ||
                    tweetHtml.toLowerCase().includes(`@${xUsername.toLowerCase()}`);

    if (!hasPlatform) {
      return res.status(400).json({ error: 'Tweet does not mention our platform (rpsroom).' });
    }
    if (!hasUser) {
      return res.status(400).json({ error: 'Tweet handle does not match your linked X username (@' + xUsername + ').' });
    }

    // Check tweet is not older than the giveaway start
    const tweetDateMatch = tweetHtml.match(/datetime="([^"]+)"/);
    if (tweetDateMatch) {
      const tweetDate = new Date(tweetDateMatch[1]);
      const giveawayDate = new Date(gw.created_at);
      if (tweetDate < giveawayDate) {
        return res.status(400).json({ error: 'Your tweet was posted before this giveaway started. Please share a new tweet.' });
      }
    }

    await db.query(
      `INSERT INTO giveaway_entries (giveaway_id, wallet_address, tweet_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (giveaway_id, wallet_address) DO UPDATE SET tweet_url = EXCLUDED.tweet_url`,
      [giveawayId, wallet, tweetUrl]
    );

    res.json({ success: true, message: 'Giveaway entry verified successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like a message (persisted to DB, one like per wallet per message)
app.post('/api/messages/:id/like', walletAuth, async (req, res) => {
  const messageId = parseInt(req.params.id);
  if (!messageId) return res.status(400).json({ error: 'Invalid message ID' });
  try {
    // Insert into message_likes (unique constraint prevents duplicates)
    await db.query(
      'INSERT INTO message_likes (message_id, wallet_address) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [messageId, req.walletAddress]
    );
    // Update likes count on messages table
    await db.query('UPDATE messages SET likes = (SELECT COUNT(*) FROM message_likes WHERE message_id = $1) WHERE id = $1', [messageId]);
    const updated = await db.query('SELECT likes FROM messages WHERE id = $1', [messageId]);
    res.json({ success: true, likes: updated.rows[0]?.likes || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Report a player
app.post('/api/players/:wallet/report', walletAuth, async (req, res) => {
  const { reason } = req.body;
  const reportedWallet = req.params.wallet;
  if (req.walletAddress === reportedWallet) {
    return res.status(400).json({ error: 'You cannot report yourself.' });
  }
  try {
    await db.query(
      'INSERT INTO player_reports (reporter_wallet, reported_wallet, reason) VALUES ($1, $2, $3)',
      [req.walletAddress, reportedWallet, (reason || 'No reason provided').slice(0, 500)]
    );
    res.json({ success: true, message: 'Report submitted. Our team will review it.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Block a player
app.post('/api/players/:wallet/block', walletAuth, async (req, res) => {
  const blockedWallet = req.params.wallet;
  if (req.walletAddress === blockedWallet) {
    return res.status(400).json({ error: 'You cannot block yourself.' });
  }
  try {
    await db.query(
      'INSERT INTO block_list (wallet_address, blocked_wallet) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.walletAddress, blockedWallet]
    );
    res.json({ success: true, message: 'Player blocked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get blocked players list
app.get('/api/players/blocked', walletAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT b.blocked_wallet, p.username FROM block_list b
       LEFT JOIN players p ON b.blocked_wallet = p.wallet_address
       WHERE b.wallet_address = $1`,
      [req.walletAddress]
    );
    res.json(result.rows);
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
      console.log('Admin account seeded. IMPORTANT: Change the default password immediately!');
    }
  } catch (err) {
    console.error('Admin seeding failed:', err.message);
  }
}

if (require.main === module) {
  setTimeout(seedAdmin, 2000);
}

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ adminId: result.rows[0].id, username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token });
  } catch (err) {
    console.error('Admin login failed:', err);
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
          (SELECT COALESCE(SUM(fee_sol),0) FROM matches) as total_fees_sol,
          (SELECT COUNT(*) FROM transactions WHERE type = 'WITHDRAW' AND status = 'PENDING') as pending_withdrawals,
          (SELECT COUNT(*) FROM giveaways WHERE status = 'ACTIVE') as active_giveaways,
          (SELECT COUNT(*) FROM player_reports WHERE created_at > NOW() - INTERVAL '7 days') as recent_reports,
          (SELECT COALESCE(value,'0') FROM platform_config WHERE key = 'platform_fees_collected_sol') as fees_collected_sol
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
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const result = await db.query(
      `SELECT wallet_address, username, rating, wins, losses, draws, sol_balance, custodial_wallet_address, to_char(last_active, 'DD Mon YYYY HH24:MI') as last_active FROM players ORDER BY sol_balance DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
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

// Manual SOL credit — validates amount is positive
app.post('/api/admin/credit-sol', adminAuth, async (req, res) => {
  const { wallet, solAmount, notes } = req.body;
  const amount = parseFloat(solAmount);
  if (!wallet || !amount || amount <= 0 || amount > 1000) {
    return res.status(400).json({ error: 'solAmount must be a positive number (max 1000 SOL per credit).' });
  }
  try {
    await db.query('UPDATE players SET sol_balance = sol_balance + $1 WHERE wallet_address = $2', [amount, wallet]);
    await db.query(
      `INSERT INTO transactions (wallet_address, type, sol_amount, status, notes)
       VALUES ($1, 'CREDIT', $2, 'COMPLETED', $3)`,
      [wallet, amount, notes || `Admin credit: ${amount} SOL`]
    );
    broadcastLobbyState();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fee sweep — resets virtual counter (ledger-only; real on-chain requires manual transfer)
app.post('/api/admin/sweep-fees', adminAuth, async (req, res) => {
  try {
    const config = await getConfig();
    const collectedSol = parseFloat(config.platform_fees_collected_sol || 0);
    if (collectedSol < 0.001) {
      return res.status(400).json({ error: `Not enough fees to sweep. Current: ${collectedSol} SOL` });
    }
    const platformWallet = config.platform_wallet_address || '7o7YrgFHTbxWGezYeue36Lfv6vzXzEsZQVePY4ic66s6';
    await db.query("UPDATE platform_config SET value = '0', updated_at = NOW() WHERE key = 'platform_fees_collected_sol'");
    await db.query(
      `INSERT INTO transactions (wallet_address, type, sol_amount, status, notes)
       VALUES ($1, 'FEE_SWEEP', $2, 'COMPLETED', $3)`,
      [platformWallet, collectedSol, `Fee sweep (ledger reset): ${collectedSol} SOL. NOTE: Actual on-chain transfer must be done manually from custodial wallets.`]
    );
    res.json({
      success: true,
      sweptSol: collectedSol,
      to: platformWallet,
      warning: 'This resets the platform fee counter only. The SOL is held across custodial player wallets and must be transferred manually on-chain.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/rooms', adminAuth, async (_req, res) => {
  try {
    const result = await db.query(`SELECT r.id, r.name, r.status, r.bet_sol, r.fee_rate, to_char(r.created_at, 'DD Mon YYYY HH24:MI') as created_at, p1.username as player1, p2.username as player2 FROM rooms r LEFT JOIN players p1 ON r.player1_wallet = p1.wallet_address LEFT JOIN players p2 ON r.player2_wallet = p2.wallet_address ORDER BY r.created_at DESC LIMIT 100`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fixed: use parameterized LIMIT instead of string interpolation
app.get('/api/admin/matches', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await db.query(
      `SELECT m.id, m.room_id, m.player1_move, m.player2_move, m.bet_sol, m.fee_sol, to_char(m.played_at,'DD Mon YYYY HH24:MI') as played_at, p1.username as player1, p2.username as player2, pw.username as winner FROM matches m LEFT JOIN players p1 ON m.player1_wallet = p1.wallet_address LEFT JOIN players p2 ON m.player2_wallet = p2.wallet_address LEFT JOIN players pw ON m.winner_wallet = pw.wallet_address ORDER BY m.played_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fixed: use parameterized LIMIT
app.get('/api/admin/messages', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const result = await db.query(
      `SELECT sender_username, sender_wallet, room_id, text, likes, to_char(created_at,'DD Mon YYYY HH24:MI') as created_at FROM messages ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// View reports (admin only)
app.get('/api/admin/reports', adminAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT pr.id, pr.reason, to_char(pr.created_at, 'DD Mon YYYY HH24:MI') as created_at,
             p1.username as reporter, p2.username as reported
      FROM player_reports pr
      LEFT JOIN players p1 ON pr.reporter_wallet = p1.wallet_address
      LEFT JOIN players p2 ON pr.reported_wallet = p2.wallet_address
      ORDER BY pr.created_at DESC LIMIT 200
    `);
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
  const { title, bet_sol, fee_rate, is_ranked, display_order, is_active } = req.body;
  // Validate fee rate
  if (parseFloat(fee_rate) < 0 || parseFloat(fee_rate) > 1) {
    return res.status(400).json({ error: 'fee_rate must be between 0 and 1 (0% to 100%).' });
  }
  try {
    const result = await db.query(
      `UPDATE room_tiers SET title=$1, bet_sol=$2, fee_rate=$3, is_ranked=$4, display_order=$5, is_active=$6 WHERE id=$7 RETURNING *`,
      [title, bet_sol, fee_rate, is_ranked, display_order, is_active, req.params.id]
    );
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Platform Config — with validation
app.get('/api/admin/config', adminAuth, async (_req, res) => {
  try {
    res.json((await db.query('SELECT * FROM platform_config ORDER BY key')).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/config/:key', adminAuth, async (req, res) => {
  const { value } = req.body;
  const { key } = req.params;

  // Validate fee rate values
  const feeKeys = ['game_fee_rate', 'withdraw_fee_rate', 'giveaway_pool_rate'];
  if (feeKeys.includes(key)) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 1) {
      return res.status(400).json({ error: `${key} must be a number between 0 and 1.` });
    }
  }

  try {
    await db.query('UPDATE platform_config SET value=$1, updated_at=NOW() WHERE key=$2', [value, key]);
    broadcastLobbyState();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Giveaways CRUD
app.get('/api/admin/giveaways', adminAuth, async (_req, res) => {
  try {
    res.json((await db.query(`SELECT id, title, description, prize_sol, winner_count, status, to_char(end_date,'DD.MM.YYYY') as end_date_str, to_char(created_at,'DD Mon YYYY') as created_at FROM giveaways ORDER BY created_at DESC`)).rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/giveaways', adminAuth, async (req, res) => {
  const { title, description, prize_sol, winner_count, end_date } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  const prize = parseFloat(prize_sol || 0);
  if (prize < 0) return res.status(400).json({ error: 'Prize cannot be negative.' });
  try {
    const result = await db.query(`INSERT INTO giveaways (title, description, prize_sol, winner_count, end_date, status) VALUES ($1, $2, $3, $4, $5, 'ACTIVE') RETURNING *`, [title, description || '', prize, winner_count || 1, end_date || null]);
    broadcastLobbyState();
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/giveaways/:id', adminAuth, async (req, res) => {
  const { title, description, prize_sol, winner_count, end_date, status } = req.body;
  try {
    const result = await db.query(`UPDATE giveaways SET title=$1, description=$2, prize_sol=$3, winner_count=$4, end_date=$5, status=$6 WHERE id=$7 RETURNING *`, [title, description || '', prize_sol || 0, winner_count || 1, end_date || null, status || 'ACTIVE', req.params.id]);
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

// Distribute giveaway — with pool balance check
app.post('/api/admin/giveaways/:id/distribute', adminAuth, async (req, res) => {
  try {
    const gwRes = await db.query('SELECT * FROM giveaways WHERE id = $1', [req.params.id]);
    if (!gwRes.rows[0]) return res.status(404).json({ error: 'Giveaway not found' });
    const gw = gwRes.rows[0];

    // Check pool has enough SOL to cover the prize
    const config = await getConfig();
    const poolSol = parseFloat(config.giveaway_pool_sol || 0);
    const prizeSol = parseFloat(gw.prize_sol);
    if (poolSol < prizeSol) {
      return res.status(400).json({
        error: `Insufficient giveaway pool. Pool has ${poolSol.toFixed(4)} SOL, prize requires ${prizeSol.toFixed(4)} SOL.`
      });
    }

    const eligibleRes = await db.query(
      `SELECT DISTINCT p.wallet_address, p.username FROM players p
       JOIN giveaway_entries ge ON ge.wallet_address = p.wallet_address
       WHERE ge.giveaway_id = $1
       ORDER BY RANDOM() LIMIT $2`, [gw.id, gw.winner_count]
    );

    const winners = eligibleRes.rows;
    if (winners.length === 0) {
      return res.status(400).json({ error: 'No eligible entries for this giveaway.' });
    }

    const solPerWinner = prizeSol / winners.length;

    for (const winner of winners) {
      await db.query('UPDATE players SET sol_balance = sol_balance + $1 WHERE wallet_address = $2', [solPerWinner, winner.wallet_address]);
      await db.query(
        `INSERT INTO giveaway_winners (giveaway_id, wallet_address, username, sol_won) VALUES ($1, $2, $3, $4)`,
        [gw.id, winner.wallet_address, winner.username, solPerWinner]
      );
    }

    await db.query("UPDATE giveaways SET status = 'COMPLETED' WHERE id = $1", [gw.id]);
    await db.query(
      "UPDATE platform_config SET value = CAST(GREATEST(0, CAST(value AS DECIMAL) - $1) AS TEXT), updated_at = NOW() WHERE key = 'giveaway_pool_sol'",
      [prizeSol]
    );
    broadcastLobbyState();
    io.to('lobby').emit('giveaway_winners', { title: gw.title, winners: winners.map(w => ({ username: w.username, solWon: solPerWinner })) });
    res.json({ success: true, winnersCount: winners.length, solPerWinner });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────
// Static Files (SPA)
// ─────────────────────────────────────────────

const clientDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(clientDistPath));

app.get('*', (_req, res) => {
  const fs = require('fs');
  if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    res.status(404).send('Build the frontend first: npm run build in /frontend');
  }
});

module.exports = server;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RPS Multiplayer server running on Port ${PORT}`);
    console.log(`CORS allowed origin: ${ALLOWED_ORIGIN}`);
  });

  // Active Lobby Broadcasting Interval (every 6 seconds)
  setInterval(() => {
    broadcastLobbyState();
  }, 6000);

  // Active Expiration Cleanup (every 1 minute) — custom rooms
  setInterval(async () => {
    try {
      const res = await db.query("DELETE FROM rooms WHERE id LIKE 'room_%' AND status = 'OPEN' AND expires_at <= NOW()");
      if (res.rowCount > 0) {
        console.log(`Cleaned up ${res.rowCount} expired custom rooms.`);
        broadcastLobbyState();
      }
    } catch (err) {
      console.error('Error cleaning up expired custom rooms:', err.message);
    }
  }, 60000);

  // AFK Waiting Room Cleanup — delete OPEN tier rooms with no player2 for 30+ minutes
  setInterval(async () => {
    try {
      const res = await db.query(`
        DELETE FROM rooms
        WHERE status = 'OPEN'
          AND player2_wallet IS NULL
          AND id LIKE 'tier_%'
          AND created_at <= NOW() - INTERVAL '30 minutes'
      `);
      if (res.rowCount > 0) {
        console.log(`Cleaned up ${res.rowCount} abandoned tier rooms.`);
        broadcastLobbyState();
      }
    } catch (err) {
      console.error('Error cleaning up abandoned tier rooms:', err.message);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

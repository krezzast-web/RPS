const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

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

// Helper: Calculate Rock-Paper-Scissors Winner
function getRoundWinner(move1, move2) {
  if (move1 === move2) return 'draw';
  if (
    (move1 === 'R' && move2 === 'S') ||
    (move1 === 'P' && move2 === 'R') ||
    (move1 === 'S' && move2 === 'P')
  ) {
    return 'player1';
  }
  return 'player2';
}

// Helper: Sync lobby rooms list and stats to all lobby users
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
      'SELECT username, rating, wins, losses, draws, sol_balance FROM players ORDER BY rating DESC LIMIT 10'
    );

    const statsRes = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM players) as wallets_count,
        (SELECT COUNT(*) FROM rooms WHERE status = 'OPEN' OR status = 'PLAYING') as rooms_count`
    );

    const generalMsgRes = await db.query(
      `SELECT sender_username as sender, text, likes, to_char(created_at, 'HH24:MI') as time 
       FROM messages 
       WHERE room_id IS NULL 
       ORDER BY created_at ASC LIMIT 20`
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
      topRanks: leaderRes.rows.map((p, idx) => ({
        id: idx + 1,
        name: p.username,
        rating: `${p.rating} RPS`,
        earnings: `${(parseFloat(p.sol_balance) - 47.0).toFixed(2)} SOL`
      })),
      stats: {
        wallets: parseInt(statsRes.rows[0].wallets_count || 0),
        rooms: parseInt(statsRes.rows[0].rooms_count || 0)
      },
      chatMessages: generalMsgRes.rows
    };

    io.to('lobby').emit('lobby_update', lobbyData);
  } catch (err) {
    console.error('Error broadcasting lobby state:', err.message);
  }
}

// WebSocket Event Listeners
io.on('connection', (socket) => {
  let userWallet = '';
  let currentRoomId = '';

  socket.on('join_lobby', async (wallet) => {
    if (!wallet) return;
    userWallet = wallet;
    socket.join('lobby');
    
    // Seed default player profile if they don't exist
    const defaultUsername = `Player_${wallet.substring(0, 4)}`;
    try {
      await db.query(
        `INSERT INTO players (wallet_address, username, rating, sol_balance)
         VALUES ($1, $2, 1000, 47.0)
         ON CONFLICT (wallet_address) DO UPDATE SET last_active = NOW()`,
        [wallet, defaultUsername]
      );
      
      const playerRes = await db.query('SELECT username, rating, sol_balance FROM players WHERE wallet_address = $1', [wallet]);
      socket.emit('profile_sync', {
        username: playerRes.rows[0].username,
        rating: playerRes.rows[0].rating,
        solBalance: parseFloat(playerRes.rows[0].sol_balance)
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

      // Set player 2 if vacant
      if (room.player1_wallet !== userWallet && !room.player2_wallet) {
        await db.query('UPDATE rooms SET player2_wallet = $1, status = \'PLAYING\' WHERE id = $2', [userWallet, roomId]);
      }

      // Query detailed player information
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
      
      // Initialize room state machine in memory
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
        // Sync player 2 in memory if joined later
        const game = activeGames.get(roomId);
        if (!game.player2Wallet && pData.player2_wallet) {
          game.player2Wallet = pData.player2_wallet;
        }
      }

      const game = activeGames.get(roomId);
      
      // Broadcast match update
      const roomSyncData = {
        roomId: roomId,
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

    if (userWallet === game.player1Wallet) {
      game.player1Ready = true;
    } else if (userWallet === game.player2Wallet) {
      game.player2Ready = true;
    }

    // When both players are ready, trigger match countdown
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
          // Start 10s round selection timer
          io.to(currentRoomId).emit('start_round', { roundNum: game.roundNum });
          startRoundTimer(currentRoomId);
        }
      }, 1000);
    } else {
      // Broadcast ready statuses
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

    if (userWallet === game.player1Wallet) {
      game.player1Move = move;
    } else if (userWallet === game.player2Wallet) {
      game.player2Move = move;
    }

    socket.emit('move_locked');

    // Resolve immediately when both choices are locked
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

    // Save histories
    game.history1.unshift(move1);
    game.history2.unshift(move2);

    try {
      const roomRes = await db.query('SELECT price, fee FROM rooms WHERE id = $1', [roomId]);
      const { price, fee } = roomRes.rows[0];
      const stake = parseFloat(price);
      const feeRate = parseFloat(fee);

      let p1Status = 'draw';
      let p2Status = 'draw';

      if (winner === 'player1') {
        p1Status = 'win';
        p2Status = 'loss';
        game.player1Score++;
        
        // Execute financial transactions and ELO adjustments
        await db.query('UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2', [stake * (1 - feeRate), game.player1Wallet]);
        await db.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = sol_balance - $1 WHERE wallet_address = $2', [stake, game.player2Wallet]);
      } else if (winner === 'player2') {
        p1Status = 'loss';
        p2Status = 'win';
        game.player2Score++;
        
        await db.query('UPDATE players SET rating = GREATEST(100, rating - 15), losses = losses + 1, sol_balance = sol_balance - $1 WHERE wallet_address = $2', [stake, game.player1Wallet]);
        await db.query('UPDATE players SET rating = rating + 25, wins = wins + 1, sol_balance = sol_balance + $1 WHERE wallet_address = $2', [stake * (1 - feeRate), game.player2Wallet]);
      } else {
        await db.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player1Wallet]);
        await db.query('UPDATE players SET draws = draws + 1 WHERE wallet_address = $1', [game.player2Wallet]);
      }

      // Broadcast resolution outputs
      io.to(roomId).emit('round_resolved', {
        player1Move: move1,
        player2Move: move2,
        player1Score: game.player1Score,
        player2Score: game.player2Score,
        winner: winner,
        roundNum: game.roundNum
      });

      // Query latest profiles
      const p1Profile = await db.query('SELECT rating, sol_balance FROM players WHERE wallet_address = $1', [game.player1Wallet]);
      const p2Profile = await db.query('SELECT rating, sol_balance FROM players WHERE wallet_address = $1', [game.player2Wallet]);

      io.to(roomId).emit('profile_sync_update', {
        player1: { wallet: game.player1Wallet, rating: p1Profile.rows[0].rating, solBalance: parseFloat(p1Profile.rows[0].sol_balance) },
        player2: { wallet: game.player2Wallet, rating: p2Profile.rows[0].rating, solBalance: parseFloat(p2Profile.rows[0].sol_balance) }
      });

      // Reset round choices and iterate
      game.player1Move = null;
      game.player2Move = null;
      game.roundNum++;

      // Trigger next round selection after 3.5s cooldown
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
      // Both AFK, trigger draw
      io.to(roomId).emit('round_resolved', {
        player1Move: null,
        player2Move: null,
        player1Score: game.player1Score,
        player2Score: game.player2Score,
        winner: 'draw',
        roundNum: game.roundNum
      });
    } else if (noMove1) {
      // Player 1 AFK, Player 2 wins
      game.player2Score++;
      io.to(roomId).emit('round_resolved', {
        player1Move: null,
        player2Move: game.player2Move,
        player1Score: game.player1Score,
        player2Score: game.player2Score,
        winner: 'player2',
        roundNum: game.roundNum
      });
    } else if (noMove2) {
      // Player 2 AFK, Player 1 wins
      game.player1Score++;
      io.to(roomId).emit('round_resolved', {
        player1Move: game.player1Move,
        player2Move: null,
        player1Score: game.player1Score,
        player2Score: game.player2Score,
        winner: 'player1',
        roundNum: game.roundNum
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
      const username = playerRes.rows[0].username;

      await db.query(
        'INSERT INTO messages (sender_username, sender_wallet, room_id, text) VALUES ($1, $2, $3, $4)',
        [username, userWallet, roomId || null, text]
      );

      const msgData = {
        id: Date.now(),
        sender: username,
        senderWallet: userWallet,
        text: text,
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
            // Promote player 2 to owner
            await db.query('UPDATE rooms SET player1_wallet = player2_wallet, player2_wallet = NULL, status = \'OPEN\' WHERE id = $1', [currentRoomId]);
          } else {
            // Delete room
            await db.query('DELETE FROM rooms WHERE id = $1', [currentRoomId]);
            activeGames.delete(currentRoomId);
          }
        } else if (room.player2_wallet === userWallet) {
          await db.query('UPDATE rooms SET player2_wallet = NULL, status = \'OPEN\' WHERE id = $1', [currentRoomId]);
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
              await db.query('UPDATE rooms SET player1_wallet = player2_wallet, player2_wallet = NULL, status = \'OPEN\' WHERE id = $1', [currentRoomId]);
            } else {
              await db.query('DELETE FROM rooms WHERE id = $1', [currentRoomId]);
              activeGames.delete(currentRoomId);
            }
          } else if (room.player2_wallet === userWallet) {
            await db.query('UPDATE rooms SET player2_wallet = NULL, status = \'OPEN\' WHERE id = $1', [currentRoomId]);
          }
        }
      } catch (err) {
        console.error('Disconnect room update error:', err.message);
      }
    }
    broadcastLobbyState();
  });
});

// REST API Health Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve compiled React build output files
const clientDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  const fs = require('fs');
  if (fs.existsSync(path.join(clientDistPath, 'index.html'))) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    res.status(404).send('Static client assets not found. Build project first.');
  }
});

module.exports = server;

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Multiplayer server boot active on Port ${PORT}`);
  });
}

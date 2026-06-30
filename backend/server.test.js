const http = require('http');
const ioClient = require('socket.io-client');

jest.mock('./db', () => {
  const players = {};
  const rooms = {};
  const messages = [];

  return {
    query: jest.fn((text, params) => {
      if (text.includes('INSERT INTO players')) {
        const wallet = params[0];
        const username = params[1];
        if (!players[wallet]) {
          players[wallet] = { wallet_address: wallet, username, rating: 1000, wins: 0, losses: 0, draws: 0, sol_balance: 47.0 };
        }
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('FROM players WHERE wallet_address')) {
        const wallet = params[0];
        const p = players[wallet] || { wallet_address: wallet, username: `Player_${wallet.substring(0, 4)}`, rating: 1000, wins: 0, losses: 0, draws: 0, sol_balance: 47.0 };
        return Promise.resolve({ rows: [p] });
      }
      if (text.includes('INSERT INTO rooms')) {
        const id = params[0];
        rooms[id] = { id, name: params[1], price: params[2], fee: 0.1, status: 'OPEN', player1_wallet: params[4], player2_wallet: null };
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('SELECT * FROM rooms WHERE id =')) {
        const id = params[0];
        return Promise.resolve({ rows: rooms[id] ? [rooms[id]] : [] });
      }
      if (text.includes('UPDATE rooms SET player2_wallet =')) {
        const wallet = params[0];
        const id = params[1];
        if (rooms[id]) {
          rooms[id].player2_wallet = wallet;
          rooms[id].status = 'PLAYING';
        }
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('SELECT r.*, p1.username as p1_name')) {
        const id = params[0];
        const r = rooms[id];
        const p1 = players[r?.player1_wallet] || { username: 'P1', rating: 1000, wins: 0, losses: 0, draws: 0 };
        const p2 = players[r?.player2_wallet] || { username: 'P2', rating: 1000, wins: 0, losses: 0, draws: 0 };
        return Promise.resolve({
          rows: [{
            id: r?.id,
            name: r?.name,
            price: r?.price,
            fee: r?.fee,
            status: r?.status,
            player1_wallet: r?.player1_wallet,
            player2_wallet: r?.player2_wallet,
            p1_name: p1.username, p1_rating: p1.rating, p1_wins: p1.wins, p1_losses: p1.losses, p1_draws: p1.draws,
            p2_name: p2.username, p2_rating: p2.rating, p2_wins: p2.wins, p2_losses: p2.losses, p2_draws: p2.draws
          }]
        });
      }
      if (text.includes('INSERT INTO messages')) {
        messages.push({ sender_username: params[0], text: params[3], likes: 0, created_at: new Date() });
        return Promise.resolve({ rows: [] });
      }
      if (text.includes('SELECT sender_username as sender')) {
        return Promise.resolve({ rows: messages.slice(-10) });
      }
      if (text.includes('SELECT COUNT(*)')) {
        return Promise.resolve({ rows: [{ wallets_count: Object.keys(players).length, rooms_count: Object.keys(rooms).length }] });
      }
      if (text.includes('SELECT username, rating')) {
        return Promise.resolve({ rows: Object.values(players).map(p => ({ username: p.username, rating: p.rating })) });
      }
      if (text.includes('SELECT r.id, r.name')) {
        return Promise.resolve({ rows: Object.values(rooms).map(r => ({ id: r.id, name: r.name, price: r.price, fee: r.fee, status: r.status, players: r.player2_wallet ? 2 : 1 })) });
      }
      return Promise.resolve({ rows: [] });
    }),
    pool: {
      end: jest.fn()
    }
  };
});

const server = require('./server');

describe('RPS WebSocket Server Integration Tests', () => {
  let client1, client2;
  const port = 5050;

  beforeAll((done) => {
    server.listen(port, () => {
      done();
    });
  });

  afterAll((done) => {
    server.close(() => {
      done();
    });
  });

  beforeEach((done) => {
    client1 = ioClient(`http://localhost:${port}`);
    client2 = ioClient(`http://localhost:${port}`);
    done();
  });

  afterEach((done) => {
    if (client1.connected) client1.disconnect();
    if (client2.connected) client2.disconnect();
    done();
  });

  it('Player joins lobby and syncs profile details', (done) => {
    client1.emit('join_lobby', 'wallet_address_123');

    client1.on('profile_sync', (profile) => {
      expect(profile).toHaveProperty('username');
      expect(profile.rating).toBe(1000);
      expect(profile.solBalance).toBe(47.0);
      done();
    });
  });

  it('Player creates custom game room and syncs details', (done) => {
    client1.emit('join_lobby', 'wallet_owner_abc');

    client1.on('profile_sync', () => {
      client1.emit('create_room', {
        roomName: 'Tuna Room',
        betAmount: '0.10',
        hasPassword: false
      });
    });

    client1.on('room_created', (roomId) => {
      expect(roomId).toContain('room_');
      done();
    });
  });

  it('Lobby updates are broadcasted to all connected clients', (done) => {
    client1.emit('join_lobby', 'wallet_user_1');
    client2.emit('join_lobby', 'wallet_user_2');

    client2.once('lobby_update', (lobbyData) => {
      expect(lobbyData).toHaveProperty('customRooms');
      expect(lobbyData).toHaveProperty('topRanks');
      expect(lobbyData.stats.wallets).toBeGreaterThanOrEqual(1);
      done();
    });
  });

  it('Clients communicate in real-time via chat broadcasts', (done) => {
    client1.emit('join_lobby', 'wallet_user_chat_1');
    client2.emit('join_lobby', 'wallet_user_chat_2');

    client2.on('chat_broadcast', (msg) => {
      expect(msg.sender).toContain('Player_');
      expect(msg.text).toBe('Hello Lobby!');
      done();
    });

    setTimeout(() => {
      client1.emit('send_chat', { text: 'Hello Lobby!' });
    }, 200);
  });
});

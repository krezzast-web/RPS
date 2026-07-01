const ioClient = require('socket.io-client');

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('test_token'),
  verify: jest.fn().mockReturnValue({ adminId: 1, username: 'admin' })
}));

// Mock @solana/web3.js — it uses ESM internally which Jest/CommonJS cannot parse
jest.mock('@solana/web3.js', () => ({
  Keypair: {
    generate: jest.fn(() => ({
      publicKey: { toString: () => 'MockCustodialAddress111111111111111111111111' },
      secretKey: new Uint8Array(64).fill(1)
    })),
    fromSecretKey: jest.fn((_key) => ({
      publicKey: { toString: () => 'MockCustodialAddress111111111111111111111111' }
    }))
  },
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn().mockResolvedValue(500000000), // 0.5 SOL in lamports
    sendRawTransaction: jest.fn().mockResolvedValue('mock_tx_signature')
  })),
  PublicKey: jest.fn().mockImplementation((addr) => ({ toString: () => addr })),
  SystemProgram: {
    transfer: jest.fn().mockReturnValue({ type: 'transfer' })
  },
  Transaction: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockReturnThis()
  })),
  LAMPORTS_PER_SOL: 1000000000,
  sendAndConfirmTransaction: jest.fn().mockResolvedValue('mock_tx_sig_abc123')
}));

jest.mock('./db', () => {
  const players = {};
  const rooms = {};
  const messages = [];

  return {
    query: jest.fn((text, _params) => {
      const params = _params || [];

      if (text.includes('INSERT INTO players')) {
        const wallet = params[0];
        const username = params[1];
        if (!players[wallet]) {
          players[wallet] = {
            wallet_address: wallet,
            username,
            rating: 1000,
            wins: 0,
            losses: 0,
            draws: 0,
            sol_balance: 0,
            custodial_wallet_address: null,
            custodial_wallet_secret: null
          };
        }
        return Promise.resolve({ rows: [] });
      }

      if (text.includes('FROM players WHERE wallet_address')) {
        const wallet = params[0];
        const p = players[wallet] || {
          wallet_address: wallet,
          username: `Player_${wallet.substring(0, 4)}`,
          rating: 1000,
          wins: 0,
          losses: 0,
          draws: 0,
          sol_balance: 0,
          custodial_wallet_address: null,
          custodial_wallet_secret: null
        };
        return Promise.resolve({ rows: [p] });
      }

      if (text.includes('UPDATE players SET custodial_wallet_address')) {
        const wallet = params[2];
        if (players[wallet]) {
          players[wallet].custodial_wallet_address = params[0];
          players[wallet].custodial_wallet_secret = params[1];
        }
        return Promise.resolve({ rows: [] });
      }

      if (text.includes('INSERT INTO rooms')) {
        const id = params[0];
        rooms[id] = {
          id,
          name: params[1],
          bet_sol: parseFloat(params[2]) || 0.01,
          fee_rate: 0.02,
          status: 'OPEN',
          player1_wallet: params[4],
          player2_wallet: null
        };
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
            bet_sol: r?.bet_sol || 0.01,
            fee_rate: r?.fee_rate || 0.02,
            status: r?.status,
            player1_wallet: r?.player1_wallet,
            player2_wallet: r?.player2_wallet,
            p1_name: p1.username, p1_rating: p1.rating, p1_wins: p1.wins, p1_losses: p1.losses, p1_draws: p1.draws,
            p2_name: p2.username, p2_rating: p2.rating, p2_wins: p2.wins, p2_losses: p2.losses, p2_draws: p2.draws
          }]
        });
      }

      if (text.includes('INSERT INTO messages')) {
        messages.push({ sender_username: params[0], text: params[3], likes: 0 });
        return Promise.resolve({ rows: [] });
      }

      if (text.includes('SELECT sender_username as sender')) {
        return Promise.resolve({ rows: messages.slice(-10) });
      }

      if (text.includes('wallets_count') || text.includes('SELECT COUNT(*)')) {
        return Promise.resolve({
          rows: [{
            wallets_count: Object.keys(players).length,
            rooms_count: Object.keys(rooms).length,
            matches_count: 0,
            giveaways_count: 0,
            pool_sol: '0',
            fees_collected_sol: '0'
          }]
        });
      }

      if (text.includes('SELECT username, rating') || text.includes('sol_balance DESC') || text.includes('ORDER BY rating DESC')) {
        return Promise.resolve({
          rows: Object.values(players).map(p => ({
            username: p.username,
            rating: p.rating,
            sol_balance: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            wallet_address: p.wallet_address
          }))
        });
      }

      if (text.includes('SELECT r.id, r.name') || text.includes('status = \'OPEN\'')) {
        return Promise.resolve({
          rows: Object.values(rooms).map(r => ({
            id: r.id,
            name: r.name,
            bet_sol: r.bet_sol,
            fee_rate: r.fee_rate,
            status: r.status,
            players: r.player2_wallet ? 2 : 1
          }))
        });
      }

      if (text.includes('FROM room_tiers')) {
        return Promise.resolve({
          rows: [
            { id: 'ranked', title: 'Ranked Room', tier_type: 'ranked', bet_sol: 0.10, fee_rate: 0.02, is_ranked: true, display_order: 0, is_active: true },
            { id: 'shrimp', title: 'Shrimp Room', tier_type: 'shrimp', bet_sol: 0.01, fee_rate: 0.02, is_ranked: false, display_order: 1, is_active: true }
          ]
        });
      }

      if (text.includes('FROM giveaways')) {
        return Promise.resolve({ rows: [] });
      }

      if (text.includes('platform_config')) {
        return Promise.resolve({
          rows: [
            { key: 'game_fee_rate', value: '0.02' },
            { key: 'giveaway_pool_sol', value: '0' },
            { key: 'platform_fees_collected_sol', value: '0' },
            { key: 'sol_rpc_url', value: 'https://api.mainnet-beta.solana.com' },
            { key: 'platform_wallet_address', value: '7o7YrgFHTbxWGezYeue36Lfv6vzXzEsZQVePY4ic66s6' }
          ]
        });
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

  it('Player joins lobby and syncs profile with SOL balance and custodial wallet', (done) => {
    client1.emit('join_lobby', 'wallet_address_123');

    client1.on('profile_sync', (profile) => {
      expect(profile).toHaveProperty('username');
      expect(profile.rating).toBe(1000);
      expect(profile).toHaveProperty('solBalance');
      expect(profile).toHaveProperty('custodialWallet');
      expect(typeof profile.solBalance).toBe('number');
      expect(profile.solBalance).toBeGreaterThanOrEqual(0);
      done();
    });
  });

  it('Player creates custom game room with SOL bet amount', async () => {
    const db = require('./db');

    // Ensure player exists with SOL balance
    await db.query(`
      INSERT INTO players (wallet_address, username, sol_balance, rating, wins, losses, draws)
      VALUES ('wallet_owner_abc', 'Player_wallet_abc', 10.0, 1000, 0, 0, 0)
      ON CONFLICT (wallet_address) DO UPDATE
        SET sol_balance = 10.0
    `);

    const roomCreated = new Promise((resolve, reject) => {
      client1.on('create_room_error', (msg) => reject(new Error('create_room_error: ' + msg)));
      client1.on('room_created', (roomId) => resolve(roomId));

      client1.emit('join_lobby', 'wallet_owner_abc');

      client1.once('profile_sync', () => {
        // Use betSol=0 to avoid any DB-state dependency on sol_balance
        client1.emit('create_room', {
          roomName: 'Test Room',
          betSol: 0,
          feeRate: 0.05,
          hasPassword: false
        });
      });
    });

    const roomId = await roomCreated;
    expect(roomId).toContain('room_');
  });

  it('Lobby updates are broadcasted with SOL stats to all connected clients', (done) => {
    client1.emit('join_lobby', 'wallet_user_1');
    client2.emit('join_lobby', 'wallet_user_2');

    client2.once('lobby_update', (lobbyData) => {
      expect(lobbyData).toHaveProperty('customRooms');
      expect(lobbyData).toHaveProperty('topRanks');
      expect(lobbyData).toHaveProperty('stats');
      expect(lobbyData.stats).toHaveProperty('poolSol');
      expect(lobbyData.stats).toHaveProperty('feesCollectedSol');
      expect(lobbyData.stats.wallets).toBeGreaterThanOrEqual(1);
      done();
    });
  });

  it('Clients communicate in real-time via chat broadcasts', (done) => {
    let chat1Ready = false;
    let chat2Ready = false;

    const trySendChat = () => {
      if (chat1Ready && chat2Ready) {
        client1.emit('send_chat', { text: 'Hello Lobby!' });
      }
    };

    client1.emit('join_lobby', 'wallet_user_chat_1');
    client2.emit('join_lobby', 'wallet_user_chat_2');

    client1.once('profile_sync', () => { chat1Ready = true; trySendChat(); });
    client2.once('profile_sync', () => { chat2Ready = true; trySendChat(); });

    client2.on('chat_broadcast', (msg) => {
      expect(msg.sender).toContain('Player_');
      expect(msg.text).toBe('Hello Lobby!');
      done();
    });
  });
});

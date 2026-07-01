# How to Test Gameplay Without Real SOL

This guide explains how to test the Rock-Paper-Scissors gameplay, matchmaking flow, and the newly integrated 3D hand assets without spending real SOL.

---

## 💻 1. Local Testing (Recommended)
The project codebase in your local workspace is a **fully functional client-side mockup**. It does not connect to the live backend or require real blockchain transactions.

When you run the project locally:
1. Open the local link: [http://localhost:5173/RPS/](http://localhost:5173/RPS/)
2. Click **Connect Wallet** or **Play** on any room card.
3. The app automatically connects a simulated wallet pre-funded with **47.0 SOL** (defined in [GameContext.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/context/GameContext.jsx#L11)).
4. You can join any room tier (including the Whale Room) and play through matches against simulated AI opponents to test the new 3D models and round resolving.

---

## ⚙️ 2. Customizing Mock Wallet Balance & Ratings
If you want to test how the UI adapts to different wallet balances or ratings, you can modify the mock wallet initial state values directly in [GameContext.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/context/GameContext.jsx#L8-L13):

```javascript
  // Wallet State
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [solBalance, setSolBalance] = useState(100.0); // <-- Edit this to mock any SOL balance
  const [rpsRating, setRpsRating] = useState(2500);    // <-- Edit this to mock your rating score
```

You can also customize the mock wallet address inside the `connectWallet` function in [GameContext.jsx](file:///c:/Users/trojan/Desktop/web/RPS/src/context/GameContext.jsx#L72-L77):

```javascript
  const connectWallet = () => {
    setWalletConnected(true);
    setWalletAddress('Haku...324');
    setSolBalance(100.0); // <-- Matches your custom mock balance on connection
    setRpsRating(2500);
  };
```

---

## 🌐 3. Understanding the Deployed Site (https://rps.flappycat.fun/)
The deployed website has been connected by your teammates to a **live backend server** utilizing a **custodial wallet model**:
* It prompts you to connect a real browser wallet (Phantom/Solflare) and sign an authentication message.
* It assigns a custodial deposit address on-chain and checks the actual blockchain balance of that address before letting you join/create game rooms.
* Therefore, testing on `https://rps.flappycat.fun/` requires real SOL deposits to fund the custodial wallet.

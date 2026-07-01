import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { GameProvider } from './context/GameContext';

// Simple mock for window.solana to prevent crash on mount
global.window.solana = {
  isPhantom: true,
  connect: async () => ({ publicKey: { toString: () => 'wallet_abc' } }),
};

describe('RPS Frontend Layout Tests', () => {
  it('Renders the header and logo layout correctly', () => {
    render(
      <GameProvider>
        <App />
      </GameProvider>
    );

    // Verify the main application branding logo text exists
    const logoTitles = screen.getAllByText(/Rpsroom/i);
    expect(logoTitles.length).toBeGreaterThanOrEqual(1);

    // Verify the connect wallet button is visible initially
    const connectBtn = screen.getByText(/CONNECT WALLET/i);
    expect(connectBtn).toBeDefined();
  });
});

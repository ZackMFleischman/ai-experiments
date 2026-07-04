// Hot-seat game surface (T3.8): the play surface plus the pass-device
// privacy interstitial. The interstitial is up whenever the current
// moveCount hasn't been acknowledged by a tap — including on first load
// and after a refresh, so a resume never exposes a rack.
import { Box } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GameController } from '../controller/GameController';
import { useGameController } from '../controller/useGameController';
import { GameBoard } from '../board/GameBoard';
import { createHotSeatOptions } from './localSession';
import { PassDeviceInterstitial } from './PassDeviceInterstitial';

const DEFAULT_NAMES = ['Player 1', 'Player 2'];

export function HotSeatGame({
  controller,
  seatNames = DEFAULT_NAMES,
}: {
  controller: GameController;
  seatNames?: readonly string[];
}) {
  const snap = useGameController(controller);
  const navigate = useNavigate();
  const [acknowledged, setAcknowledged] = useState<number | null>(null);
  const needsHandoff = !snap.end && acknowledged !== snap.state.moveCount;

  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <GameBoard
        controller={controller}
        seatNames={seatNames}
        onRematch={() => {
          void controller.newGame(
            createHotSeatOptions(snap.options.rulesetId, snap.options.dictionaryId),
          );
          setAcknowledged(null);
        }}
        onBackToLobby={() => navigate('/')}
      />
      {needsHandoff && (
        <PassDeviceInterstitial
          name={seatNames[snap.toMove] ?? `Player ${snap.toMove + 1}`}
          onReveal={() => setAcknowledged(snap.state.moveCount)}
        />
      )}
    </Box>
  );
}

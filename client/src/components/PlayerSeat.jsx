import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from './Card';
import Avatar from './Avatar';
import { ChipStack } from './PokerChip';
import TimerRing from './TimerRing';
import { colors } from '../theme';

const ACTION_DISPLAY_MS = 2000;

function formatActionLabel(a) {
  if (!a) return '';
  switch (a.action) {
    case 'fold': return 'Fold';
    case 'check': return 'Check';
    case 'call': return a.amount ? `Call $${a.amount.toLocaleString()}` : 'Call';
    case 'bet': return a.amount ? `Bet $${a.amount.toLocaleString()}` : 'Bet';
    case 'raise': return a.amount ? `Raise $${a.amount.toLocaleString()}` : 'Raise';
    case 'all-in': return 'All In';
    default: return a.action;
  }
}

export function useActionFlash(player, lastAction) {
  const [label, setLabel] = useState(null);
  const actionT = lastAction && lastAction.playerId === player?.id ? lastAction.t : null;
  useEffect(() => {
    if (!actionT) return;
    setLabel(formatActionLabel(lastAction));
    const id = setTimeout(() => setLabel(null), ACTION_DISPLAY_MS);
    return () => clearTimeout(id);
  }, [actionT]);
  return label;
}

export default function PlayerSeat({ player, isMe = false, win = null, turnDeadline = null, lastAction = null }) {
  const actionLabel = useActionFlash(player, lastAction);

  if (!player) return <View style={styles.empty} />;

  const isActive = player.isCurrentPlayer;
  const isFolded = player.folded;

  return (
    <View style={[
      styles.seat,
      isActive && styles.seatActive,
      isFolded && styles.seatFolded,
    ]}>
      {/* Cards */}
      <View style={[styles.cards, !player.holeCards?.length && styles.hidden]}>
        {[0, 1].map(i => (
          <View
            key={i}
            style={[
              styles.cardWrap,
              i === 0 ? styles.cardLeft : styles.cardRight,
            ]}
          >
            <Card
              card={player.holeCards?.[i]}
              size="lg"
              faceDown={!player.holeCards?.[i] || player.holeCards[i]?.hidden}
            />
          </View>
        ))}
      </View>

      {/* Nameplate */}
      <View style={styles.nameplate}>
        <View style={styles.npText}>
          <View style={styles.nameRow}>
            <Text style={styles.npName} numberOfLines={1}>{player.name}</Text>
            {player.isSmallBlind && <View style={[styles.badge, styles.badgeSB]}><Text style={styles.badgeText}>SB</Text></View>}
            {player.isBigBlind && <View style={[styles.badge, styles.badgeBB]}><Text style={styles.badgeText}>BB</Text></View>}
            {player.allIn && <View style={[styles.badge, styles.badgeAllin]}><Text style={styles.badgeText}>ALL IN</Text></View>}
          </View>
          <Text style={[styles.npChips, win && styles.npChipsWinner, !!actionLabel && styles.npChipsAction]}>
            {win ? 'Winner' : (actionLabel || `$${player.chips.toLocaleString()}`)}
          </Text>
        </View>
        <View style={styles.avatarWrap}>
          <Avatar size={52} avatarId={player.avatarId} />
          <TimerRing turnDeadline={turnDeadline} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seat: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  seatActive: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  seatFolded: {
    opacity: 0.45,
  },
  empty: {
    height: 90,
  },
  cards: {
    flexDirection: 'row',
    marginBottom: 6,
    height: 58,
  },
  hidden: {
    opacity: 0,
  },
  cardWrap: {
    position: 'relative',
  },
  cardLeft: {
    transform: [{ rotate: '-4deg' }, { translateX: 4 }],
    zIndex: 1,
  },
  cardRight: {
    transform: [{ rotate: '4deg' }, { translateX: -4 }],
  },
  nameplate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
    minWidth: 160,
  },
  npText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  npName: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  npChips: {
    color: colors.goldLight,
    fontSize: 13,
    fontWeight: '600',
  },
  npChipsAction: {
    color: colors.orange,
  },
  npChipsWinner: {
    color: '#4ade80',
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  badgeSB: { backgroundColor: colors.blue },
  badgeBB: { backgroundColor: colors.orange },
  badgeAllin: { backgroundColor: colors.red },
  avatarWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});

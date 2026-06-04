import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, Image, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { GameContext } from '../context/GameContext';
import { colors } from '../theme';
import { SERVER_URL } from '../config';

const AVATAR_IMAGES = {
  dk:    require('../../assets/dk.png'),
  diddy: require('../../assets/diddy.webp'),
  alfie: require('../../assets/alfie.png'),
  jazz:  require('../../assets/jazz.png'),
};

function PlayerRow({ player, action, actionLabel, actionColor, secondAction, secondLabel }) {
  return (
    <View style={s.playerRow}>
      <Image source={AVATAR_IMAGES[player.avatarId] || AVATAR_IMAGES.dk} style={s.avatar} />
      <View style={s.playerInfo}>
        <Text style={s.playerName} numberOfLines={1}>{player.displayName || player.name}</Text>
        {player.elo != null && <Text style={s.playerElo}>ELO {player.elo}</Text>}
      </View>
      {player.online && <View style={s.onlineDot} />}
      {secondAction && (
        <Pressable style={[s.actionBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]} onPress={secondAction}>
          <Text style={s.actionBtnTxt}>{secondLabel}</Text>
        </Pressable>
      )}
      {action && (
        <Pressable style={[s.actionBtn, { backgroundColor: actionColor || colors.gold }]} onPress={action}>
          <Text style={[s.actionBtnTxt, { color: actionColor ? '#fff' : '#000' }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function FriendsTab({ onlinePlayers }) {
  const { playerInfo, emit, incomingChallenge, setIncomingChallenge, setPendingFriendRequests } = useContext(GameContext);

  const [friends, setFriends]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [searchQ, setSearchQ]         = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching]     = useState(false);

  const loadFriends = useCallback(() => {
    if (!playerInfo?.playerId) return;
    fetch(`${SERVER_URL}/api/friends/${playerInfo.playerId}`)
      .then(r => r.json())
      .then(data => {
        setFriends(Array.isArray(data) ? data : []);
        const pending = data.filter(f => f.status === 'pending' && !f.isRequester).length;
        setPendingFriendRequests(pending);
      })
      .catch(() => setFriends([]))
      .finally(() => setLoading(false));
  }, [playerInfo?.playerId]);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  // Debounced search
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults(null); return; }
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`${SERVER_URL}/api/players/search?q=${encodeURIComponent(searchQ)}`)
        .then(r => r.json())
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQ]);

  const sendRequest = async (addresseeId) => {
    await fetch(`${SERVER_URL}/api/friends/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId: playerInfo.playerId, addresseeId }),
    });
    loadFriends();
  };

  const accept = async (requesterId) => {
    await fetch(`${SERVER_URL}/api/friends/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, addresseeId: playerInfo.playerId }),
    });
    loadFriends();
  };

  const decline = async (requesterId) => {
    await fetch(`${SERVER_URL}/api/friends/decline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId, addresseeId: playerInfo.playerId }),
    });
    loadFriends();
  };

  const unfriend = async (friendId) => {
    await fetch(`${SERVER_URL}/api/friends/${playerInfo.playerId}/${friendId}`, { method: 'DELETE' });
    loadFriends();
  };

  const challenge = (friendId) => {
    emit('challenge-send', { toId: friendId });
  };

  const acceptChallenge = () => {
    if (!incomingChallenge) return;
    emit('challenge-accept', { fromId: incomingChallenge.fromId });
    setIncomingChallenge(null);
  };

  const declineChallenge = () => {
    if (!incomingChallenge) return;
    emit('challenge-decline', { fromId: incomingChallenge.fromId });
    setIncomingChallenge(null);
  };

  const accepted  = friends?.filter(f => f.status === 'accepted') || [];
  const incoming  = friends?.filter(f => f.status === 'pending' && !f.isRequester) || [];
  const outgoing  = friends?.filter(f => f.status === 'pending' && f.isRequester) || [];
  const friendIds = new Set(accepted.map(f => f.friendId));

  // Non-friend online players
  const otherOnline = (onlinePlayers || []).filter(p =>
    p.id !== playerInfo?.playerId && !friendIds.has(p.id)
  );

  if (loading) return <ActivityIndicator color={colors.gold} style={{ marginTop: 10 }} />;

  return (
    <View style={s.wrap}>
      {/* Incoming challenge banner */}
      {incomingChallenge && (
        <View style={s.challengeBanner}>
          <Text style={s.challengeTxt}>⚔️ {incomingChallenge.fromName} challenges you!</Text>
          <View style={s.challengeBtns}>
            <Pressable style={s.challengeDecline} onPress={declineChallenge}>
              <Text style={s.challengeBtnTxt}>Decline</Text>
            </Pressable>
            <Pressable style={s.challengeAccept} onPress={acceptChallenge}>
              <Text style={s.challengeBtnTxt}>Accept</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Search */}
      <View style={s.searchRow}>
        <TextInput style={s.searchInput} placeholder="Search players…" placeholderTextColor={colors.gray}
          value={searchQ} onChangeText={setSearchQ} />
        {searching && <ActivityIndicator color={colors.gold} size="small" style={{ marginLeft: 8 }} />}
      </View>

      {/* Search results */}
      {searchResults && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Results</Text>
          {searchResults.length === 0
            ? <Text style={s.empty}>No players found</Text>
            : searchResults.filter(r => r.id !== playerInfo?.playerId).map(r => (
              <PlayerRow key={r.id} player={r}
                action={friendIds.has(r.id) ? null : () => sendRequest(r.id)}
                actionLabel="Add"
                actionColor={colors.gold} />
            ))
          }
        </View>
      )}

      {/* Incoming requests */}
      {incoming.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Friend Requests</Text>
          {incoming.map(f => (
            <PlayerRow key={f.friendId} player={{ ...f, displayName: f.displayName }}
              action={() => accept(f.friendId)} actionLabel="Accept" actionColor="#22c55e"
              secondAction={() => decline(f.friendId)} secondLabel="Decline" />
          ))}
        </View>
      )}

      {/* Friends */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>Friends {accepted.length > 0 ? `(${accepted.length})` : ''}</Text>
        {accepted.length === 0
          ? <Text style={s.empty}>No friends yet — search above or add someone after a match</Text>
          : accepted.map(f => (
            <PlayerRow key={f.friendId} player={f}
              action={f.online ? () => challenge(f.friendId) : null}
              actionLabel="⚔️ Challenge" actionColor="#7c3aed"
              secondAction={() => unfriend(f.friendId)} secondLabel="✕" />
          ))
        }
      </View>

      {/* Players Online */}
      {otherOnline.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Players Online</Text>
          {otherOnline.map(p => (
            <PlayerRow key={p.id}
              player={{ displayName: p.name, avatarId: p.avatarId, online: true }}
              action={() => sendRequest(p.id)} actionLabel="+ Add" actionColor={colors.gold} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12 },
  challengeBanner: { backgroundColor: 'rgba(124,58,237,0.25)', borderRadius: 10, borderWidth: 1, borderColor: '#7c3aed', padding: 10, gap: 8 },
  challengeTxt: { color: colors.white, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  challengeBtns: { flexDirection: 'row', gap: 8 },
  challengeDecline: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  challengeAccept: { flex: 1, backgroundColor: '#7c3aed', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  challengeBtnTxt: { color: colors.white, fontSize: 13, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center' },
  searchInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, color: colors.white, fontSize: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  section: { gap: 6 },
  sectionLabel: { color: colors.gray, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  empty: { color: colors.gray, fontSize: 12, fontStyle: 'italic' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  playerInfo: { flex: 1 },
  playerName: { color: colors.white, fontSize: 13, fontWeight: '600' },
  playerElo: { color: colors.gray, fontSize: 11 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  actionBtn: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  actionBtnTxt: { fontSize: 12, fontWeight: '700' },
});

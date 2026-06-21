import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { track } from '../utils/analytics';

export default function AchievementGallery({ achievements, onOpen }) {
  const [selected, setSelected] = useState(null);
  const trackedOpen = useRef(false);
  const earnedCount = achievements.filter(a => a.earned).length;

  const onTile = (a) => {
    if (!trackedOpen.current) {
      track('AchievementGalleryOpened');
      onOpen?.();
      trackedOpen.current = true;
    }
    setSelected(a);
  };

  return (
    <>
      <View style={s.sec}>
        <Text style={s.secIc}>🏅</Text>
        <Text style={s.secTitle}>Achievements</Text>
        <View style={s.chip}>
          <Text style={s.chipTxt}>{earnedCount}/{achievements.length}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        style={s.scroll}
      >
        {achievements.map(a => {
          const pct = a.progressTarget
            ? Math.min(1, (a.progress?.current ?? 0) / a.progressTarget)
            : 0;
          return (
            <Pressable
              key={a.id}
              style={[s.tile, a.earned && s.tileEarned]}
              onPress={() => onTile(a)}
            >
              <Text style={[s.tileIcon, !a.earned && s.tileIconLocked]}>
                {a.icon}
              </Text>
              <Text
                style={[s.tileName, !a.earned && s.tileNameLocked]}
                numberOfLines={2}
              >
                {a.name}
              </Text>
              {!a.earned && <Text style={s.lockBadge}>🔒</Text>}
              {a.progressTarget !== null && !a.earned && (
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={s.overlay} onPress={() => setSelected(null)}>
          <Pressable style={s.sheet}>
            {selected && (
              <>
                <Text style={[s.sheetIcon, !selected.earned && s.sheetIconLocked]}>
                  {selected.icon}
                </Text>
                <Text style={s.sheetName}>{selected.name}</Text>
                <Text style={s.sheetDesc}>{selected.description}</Text>

                {selected.earned ? (
                  <View style={s.earnedPill}>
                    <Text style={s.earnedTxt}>Earned ✓</Text>
                  </View>
                ) : (
                  <>
                    <Text style={s.lockedHow}>🔒 Locked · {selected.howToEarn}</Text>
                    {selected.progressTarget !== null && (
                      <View style={s.sheetProgressWrap}>
                        <View style={s.sheetBar}>
                          <View
                            style={[
                              s.sheetBarFill,
                              {
                                width: `${Math.min(100,
                                  Math.round(((selected.progress?.current ?? 0) / selected.progressTarget) * 100),
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                        <Text style={s.sheetProgressTxt}>
                          {selected.progress?.current ?? 0} / {selected.progressTarget}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const TILE_W = 86;
const TILE_H = 104;

const s = StyleSheet.create({
  sec: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 22, marginBottom: 11, paddingHorizontal: 2,
  },
  secIc: { fontSize: 14 },
  secTitle: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  chip: {
    marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9,
  },
  chipTxt: { color: '#5b6a7d', fontSize: 12, fontWeight: '800' },

  scroll: { marginBottom: 8 },
  scrollContent: { flexDirection: 'row', gap: 8, paddingBottom: 6 },

  tile: {
    width: TILE_W, height: TILE_H, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6, paddingTop: 10, paddingBottom: 8,
    position: 'relative', overflow: 'hidden',
  },
  tileEarned: {
    borderColor: colors.goldLight,
    backgroundColor: 'rgba(240,192,64,0.08)',
    shadowColor: colors.goldLight, shadowOpacity: 0.4,
    shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 5,
  },
  tileIcon: { fontSize: 38, marginBottom: 6 },
  tileIconLocked: { opacity: 0.32 },
  tileName: {
    color: colors.white, fontSize: 10, fontWeight: '800',
    textAlign: 'center', lineHeight: 13,
  },
  tileNameLocked: { color: '#5b6a7d' },

  lockBadge: { position: 'absolute', top: 5, right: 6, fontSize: 10 },

  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  barFill: { height: 3, backgroundColor: colors.goldLight },

  // Detail modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center',
  },
  sheet: {
    width: 280, backgroundColor: '#0f1c2e', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24,
  },
  sheetIcon: { fontSize: 52, marginBottom: 12 },
  sheetIconLocked: { opacity: 0.35 },
  sheetName: { color: colors.white, fontSize: 20, fontWeight: '900', marginBottom: 8 },
  sheetDesc: {
    color: '#8a98aa', fontSize: 14, fontWeight: '700',
    textAlign: 'center', lineHeight: 20, marginBottom: 16,
  },
  earnedPill: {
    backgroundColor: 'rgba(54,208,127,0.12)', borderWidth: 1,
    borderColor: 'rgba(54,208,127,0.4)', borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 18,
  },
  earnedTxt: { color: '#36d07f', fontSize: 14, fontWeight: '800' },
  lockedHow: { color: '#8a98aa', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  sheetProgressWrap: { marginTop: 14, width: '100%', alignItems: 'center', gap: 6 },
  sheetBar: {
    width: '100%', height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2,
  },
  sheetBarFill: { height: 4, backgroundColor: colors.goldLight, borderRadius: 2 },
  sheetProgressTxt: { color: '#8a98aa', fontSize: 12, fontWeight: '700' },
});

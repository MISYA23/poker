import React, { useContext, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { GameContext } from '../context/GameContext';
import { SERVER_URL } from '../config';
import { colors } from '../theme';

const FEEDBACK_OPTIONS = [
  { value: 'bug',        label: '🐞 Bug' },
  { value: 'game_issue', label: '🎮 Game issue' },
  { value: 'feedback',   label: '💬 Feedback' },
];

// Self-contained Feedback button + modal (POST /api/feedback). Reusable across screens.
export default function FeedbackButton({ buttonStyle, textStyle }) {
  const { playerInfo } = useContext(GameContext);
  const [open, setOpen]                 = useState(false);
  const [type, setType]                 = useState('bug');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [text, setText]                 = useState('');
  const [state, setState]               = useState('idle'); // idle | sending | done | error

  const openFeedback = () => { setType('bug'); setText(''); setState('idle'); setTypeMenuOpen(false); setOpen(true); };

  const submit = async () => {
    if (!text.trim() || state === 'sending') return;
    setState('sending');
    try {
      const res = await fetch(`${SERVER_URL}/api/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, details: text.trim(), playerId: playerInfo?.playerId, playerName: playerInfo?.name }),
      });
      if (!res.ok) throw new Error('bad status');
      setState('done');
      setTimeout(() => setOpen(false), 1200);
    } catch (e) { setState('error'); }
  };

  return (
    <>
      <Pressable style={[s.btn, buttonStyle]} onPress={openFeedback}>
        <Text style={[s.btnTxt, textStyle]}>Feedback</Text>
      </Pressable>

      {open && (
        <Pressable style={s.overlay} onPress={() => setTypeMenuOpen(false)}>
          <Pressable style={s.modal} onPress={() => {}}>
            <Text style={s.title}>Send Feedback</Text>

            <View style={{ zIndex: 10 }}>
              <Pressable style={s.dropdown} onPress={() => setTypeMenuOpen(o => !o)}>
                <Text style={s.dropdownTxt}>{FEEDBACK_OPTIONS.find(o => o.value === type)?.label}</Text>
                <Text style={s.caret}>{typeMenuOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {typeMenuOpen && (
                <View style={s.dropdownMenu}>
                  {FEEDBACK_OPTIONS.map(opt => (
                    <Pressable key={opt.value} style={s.dropdownItem} onPress={() => { setType(opt.value); setTypeMenuOpen(false); }}>
                      <Text style={[s.dropdownItemTxt, opt.value === type && { color: colors.gold, fontWeight: '800' }]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <TextInput style={s.input} placeholder="Describe it…" placeholderTextColor="rgba(255,255,255,0.35)"
              value={text} onChangeText={setText} onFocus={() => setTypeMenuOpen(false)} multiline textAlignVertical="top" maxLength={5000} />

            {state === 'error' && <Text style={s.err}>Couldn't send — try again.</Text>}
            {state === 'done'  && <Text style={s.done}>✓ Thanks! Sent.</Text>}

            <View style={s.btns}>
              <Pressable style={[s.mbtn, s.mbtnNo]} onPress={() => setOpen(false)}><Text style={s.mbtnTxt}>Cancel</Text></Pressable>
              <Pressable style={[s.mbtn, s.mbtnYes, (!text.trim() || state === 'sending') && { opacity: 0.5 }]}
                disabled={!text.trim() || state === 'sending'} onPress={submit}>
                <Text style={s.mbtnTxt}>{state === 'sending' ? 'Sending…' : 'Submit'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      )}
    </>
  );
}

const s = StyleSheet.create({
  btn:    { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  btnTxt: { color: colors.white, fontSize: 12, fontWeight: '600' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 },
  modal:  { backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 24, padding: 22, gap: 14, width: '100%', maxWidth: 380, alignItems: 'stretch' },
  title:  { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  dropdown:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dropdownTxt: { color: colors.white, fontSize: 15, fontWeight: '600' },
  caret:       { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  dropdownMenu:{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, backgroundColor: '#1b1b1b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, overflow: 'hidden', elevation: 8 },
  dropdownItem:{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  dropdownItemTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 15 },
  input:  { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 12, color: colors.white, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, minHeight: 110, maxHeight: 220 },
  err:    { color: '#f87171', fontSize: 13, textAlign: 'center' },
  done:   { color: '#4ade80', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  btns:   { flexDirection: 'row', gap: 12, marginTop: 4, alignSelf: 'stretch' },
  mbtn:   { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  mbtnNo: { backgroundColor: 'rgba(255,255,255,0.1)' },
  mbtnYes:{ backgroundColor: colors.gold, flex: 1.5 },
  mbtnTxt:{ color: colors.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
});

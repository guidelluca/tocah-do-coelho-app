import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { postMoradorPin } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { displayName } from '../utils/text';
import { AppText, BottomSheet, Button, Icon, TextField, useFeedback } from '../components/ui';

const KEY = (nome) => `@tocah_morador_token:${String(nome || '').toUpperCase()}`;
const Ctx = createContext(null);

/**
 * PIN de cada morador: protege entrega e avaliação (ninguém faz no nome do outro).
 * `comPin(nome, fn)` roda a ação com o token; se o servidor pedir PIN, abre a janela e tenta de novo.
 */
export function MoradorPinProvider({ children }) {
  const { spacing, radius, colors } = useTheme();
  const { toastError, toast } = useFeedback();
  const [tokens, setTokens] = useState({});
  const [pedido, setPedido] = useState(null); // { nome, modo: 'entrar'|'criar', resolve, reject }
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const tokensRef = useRef({});

  const carregar = useCallback(async (nome) => {
    const n = String(nome || '').toUpperCase();
    if (tokensRef.current[n] !== undefined) return tokensRef.current[n];
    let t = '';
    try {
      t = (await AsyncStorage.getItem(KEY(n))) || '';
    } catch {
      t = '';
    }
    tokensRef.current[n] = t;
    setTokens((prev) => ({ ...prev, [n]: t }));
    return t;
  }, []);

  const salvar = useCallback(async (nome, t) => {
    const n = String(nome || '').toUpperCase();
    tokensRef.current[n] = t || '';
    setTokens((prev) => ({ ...prev, [n]: t || '' }));
    try {
      if (t) await AsyncStorage.setItem(KEY(n), t);
      else await AsyncStorage.removeItem(KEY(n));
    } catch {
      /* fica só nesta sessão */
    }
  }, []);

  const pedirPin = useCallback((nome, modo = 'entrar') => new Promise((resolve, reject) => {
    setPin('');
    setPin2('');
    setPedido({ nome: String(nome || '').toUpperCase(), modo, resolve, reject });
  }), []);

  const comPin = useCallback(async (nome, fn) => {
    const token = await carregar(nome);
    try {
      return await fn(token);
    } catch (e) {
      if (e?.code !== 'MORADOR_PIN') throw e;
      await salvar(nome, '');
      const novo = await pedirPin(nome, 'entrar');
      return fn(novo);
    }
  }, [carregar, salvar, pedirPin]);

  const criarPin = useCallback((nome) => pedirPin(nome, 'criar'), [pedirPin]);

  const fechar = () => {
    if (busy) return;
    pedido?.reject?.(Object.assign(new Error('PIN cancelado.'), { code: 'PIN_CANCELADO', silent: true }));
    setPedido(null);
  };

  const enviar = async () => {
    if (!pedido) return;
    if (pedido.modo === 'criar' && pin !== pin2) {
      toast('Os dois PINs não batem.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await postMoradorPin(pedido.modo === 'criar' ? 'moradorDefinirPin' : 'moradorEntrar', { usuario: pedido.nome, pin });
      await salvar(pedido.nome, res.moradorToken);
      if (pedido.modo === 'criar') toast('PIN criado. Só você entrega e avalia no seu nome.', 'success');
      pedido.resolve(res.moradorToken);
      setPedido(null);
    } catch (e) {
      if (e?.code === 'NO_PIN') {
        setPedido({ ...pedido, modo: 'criar' });
        toast('Você ainda não tem PIN. Crie um agora.', 'info');
      } else toastError(e, 'PIN não aceito.');
    } finally {
      setBusy(false);
    }
  };

  const value = useMemo(() => ({ comPin, criarPin, tokens, carregar, sair: (n) => salvar(n, '') }), [comPin, criarPin, tokens, carregar, salvar]);
  const criando = pedido?.modo === 'criar';
  return (
    <Ctx.Provider value={value}>
      {children}
      <BottomSheet
        visible={!!pedido}
        onClose={fechar}
        title={pedido ? (criando ? `Crie seu PIN, ${displayName(pedido.nome)}` : `PIN de ${displayName(pedido.nome)}`) : ''}
        footer={<Button label={criando ? 'Criar PIN' : 'Entrar'} icon="lock-open-outline" onPress={enviar} loading={busy} disabled={pin.length < 4} style={{ flex: 1 }} />}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginBottom: spacing.md }}>
          <Icon name="shield-lock-outline" color="onPrimarySoft" />
          <AppText variant="caption" color="onPrimarySoft" style={{ flex: 1 }}>
            {criando
              ? 'Com o PIN, só você manda a foto e dá notas no seu nome — no app e no link do e-mail. Guarde bem: se esquecer, o Guilherme apaga e você cria outro.'
              : 'Esse morador protegeu as entregas e notas com PIN.'}
          </AppText>
        </View>
        <TextField label="PIN (4 a 8 números)" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" secureTextEntry autoFocus />
        {criando && <TextField label="Repita o PIN" value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" secureTextEntry />}
      </BottomSheet>
    </Ctx.Provider>
  );
}

export function useMoradorPin() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('MoradorPinProvider ausente');
  return ctx;
}

/** Carrega o token salvo ao trocar de morador. */
export function useMoradorToken(nome) {
  const { tokens, carregar } = useMoradorPin();
  useEffect(() => {
    if (nome) carregar(nome);
  }, [nome, carregar]);
  return tokens[String(nome || '').toUpperCase()] || '';
}

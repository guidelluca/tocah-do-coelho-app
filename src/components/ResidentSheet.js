import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { pickPhoto } from '../utils/photo';
import { displayName } from '../utils/text';
import { AppText, Avatar, BottomSheet, Button, Divider, Icon, ListRow, PressableScale, Segmented, useFeedback } from './ui';

/** Quem é você + foto de perfil (compartilhada) + tema. Abre pelo avatar no topo. */
export function ResidentSheet({ visible, onClose, firstRun = false }) {
  const { resident, residents, selectResident, getResidentPhoto, updatePhoto } = useResident();
  const { mode, setThemeMode, spacing, colors } = useTheme();
  const { toast, toastError, confirm } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [photoFor, setPhotoFor] = useState(null);
  const target = photoFor || resident;
  useEffect(() => {
    if (visible) setPhotoFor(null);
  }, [visible]);
  const targetLabel = target === resident ? 'sua foto' : `a foto de ${displayName(target)}`;

  const changePhoto = async (source) => {
    try {
      const data = await pickPhoto({ source, size: 'avatar' });
      if (!data) return;
      setSaving(true);
      await updatePhoto(target, data);
      toast(target === resident ? 'Foto atualizada. Agora todo mundo vê!' : `Foto de ${displayName(target)} atualizada para todo mundo.`, 'success');
    } catch (e) {
      toastError(e, 'Não deu para salvar a foto.');
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async () => {
    if (!(await confirm({ title: `Remover ${targetLabel}?`, message: 'Volta a aparecer só a inicial do nome.', confirmLabel: 'Remover', destructive: true }))) return;
    try {
      setSaving(true);
      await updatePhoto(target, '');
      toast('Foto removida.', 'success');
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      dismissable={!firstRun}
      title={firstRun ? 'Quem é você?' : 'Você e a galera'}
      subtitle={firstRun ? 'Escolha seu nome. Dá para trocar depois tocando no seu avatar lá em cima.' : 'Troque de morador, foto e tema'}
    >
      {residents.map((name) => {
        const active = name === resident && !firstRun;
        return (
          <ListRow
            key={name}
            onPress={async () => {
              await selectResident(name);
              onClose?.();
            }}
            accessibilityLabel={`Sou ${displayName(name)}`}
            left={<Avatar name={name} size={44} ring={active ? 'primary' : undefined} />}
            title={displayName(name)}
            titleColor={active ? 'primary' : 'text'}
            right={active ? <Icon name="check-circle" color="primary" size={22} /> : null}
          />
        );
      })}
      {!firstRun && (
        <>
          <Divider style={{ marginVertical: spacing.md }} />
          <AppText variant="overline" color="textMuted">Fotos de perfil</AppText>
          <AppText variant="caption" color="textSubtle" style={{ marginBottom: spacing.sm }}>Toque em alguém para trocar a foto. Todo mundo vê a mesma foto.</AppText>
          <View style={[styles.people, { gap: spacing.sm, marginBottom: spacing.md }]}>
            {residents.map((name) => {
              const active = name === target;
              return (
                <PressableScale key={name} onPress={() => setPhotoFor(name)} accessibilityLabel={`Trocar a foto de ${displayName(name)}`} accessibilityState={{ selected: active }} scaleTo={0.92} style={styles.person}>
                  <View>
                    <Avatar name={name} size={52} ring={active ? 'primary' : undefined} />
                    <View style={[styles.camBadge, { backgroundColor: active ? colors.primary : colors.surfaceAlt, borderColor: colors.surface }]}>
                      <Icon name="camera" size={12} color={active ? 'onPrimary' : 'textMuted'} />
                    </View>
                  </View>
                  <AppText variant="caption" color={active ? 'primary' : 'textMuted'} numberOfLines={1}>{name === resident ? 'Você' : displayName(name)}</AppText>
                </PressableScale>
              );
            })}
          </View>
          <AppText variant="captionStrong" style={{ marginBottom: spacing.sm }}>Trocar {targetLabel}</AppText>
          <View style={styles.actions}>
            <Button label="Galeria" icon="image-outline" variant="secondary" size="sm" onPress={() => changePhoto('library')} loading={saving} style={{ flex: 1 }} />
            <Button label="Câmera" icon="camera-outline" variant="secondary" size="sm" onPress={() => changePhoto('camera')} disabled={saving} style={{ flex: 1 }} />
          </View>
          {!!getResidentPhoto(target) && <Button label={`Remover ${targetLabel}`} variant="ghost" size="sm" onPress={removePhoto} disabled={saving} style={{ marginTop: spacing.xs }} />}
          <Divider style={{ marginVertical: spacing.md }} />
          <AppText variant="overline" color="textMuted" style={{ marginBottom: spacing.sm }}>Tema</AppText>
          <Segmented
            value={mode}
            onChange={setThemeMode}
            options={[
              { value: 'system', label: 'Automático' },
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
            ]}
          />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  people: { flexDirection: 'row', justifyContent: 'space-between' },
  person: { alignItems: 'center', gap: 4, flex: 1, minWidth: 56, minHeight: 44 },
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  actions: { flexDirection: 'row', gap: 8 },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useResident } from '../context/ResidentContext';
import { useTheme } from '../theme/ThemeContext';
import { pickPhoto } from '../utils/photo';
import { displayName } from '../utils/text';
import { AppText, Avatar, BottomSheet, Button, Divider, Icon, ListRow, Segmented, useFeedback } from './ui';

/** Quem é você + foto de perfil (compartilhada) + tema. Abre pelo avatar no topo. */
export function ResidentSheet({ visible, onClose, firstRun = false }) {
  const { resident, residents, selectResident, getResidentPhoto, updateMyPhoto } = useResident();
  const { mode, setThemeMode, spacing } = useTheme();
  const { toast, toastError, confirm } = useFeedback();
  const [saving, setSaving] = useState(false);

  const changePhoto = async (source) => {
    try {
      const data = await pickPhoto({ source, size: 'avatar' });
      if (!data) return;
      setSaving(true);
      await updateMyPhoto(data);
      toast('Foto atualizada. Agora todo mundo vê!', 'success');
    } catch (e) {
      toastError(e, 'Não deu para salvar a foto.');
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async () => {
    if (!(await confirm({ title: 'Remover sua foto?', message: 'Volta a aparecer só a inicial do seu nome.', confirmLabel: 'Remover', destructive: true }))) return;
    try {
      setSaving(true);
      await updateMyPhoto('');
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
      title={firstRun ? 'Quem é você?' : 'Você'}
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
          <AppText variant="overline" color="textMuted" style={{ marginBottom: spacing.sm }}>Sua foto de perfil</AppText>
          <View style={styles.photoRow}>
            <Avatar name={resident} size={64} />
            <View style={{ flex: 1, gap: spacing.sm }}>
              <View style={styles.actions}>
                <Button label="Galeria" icon="image-outline" variant="secondary" size="sm" onPress={() => changePhoto('library')} loading={saving} style={{ flex: 1 }} />
                <Button label="Câmera" icon="camera-outline" variant="secondary" size="sm" onPress={() => changePhoto('camera')} disabled={saving} style={{ flex: 1 }} />
              </View>
              {!!getResidentPhoto(resident) && <Button label="Remover foto" variant="ghost" size="sm" onPress={removePhoto} disabled={saving} />}
            </View>
          </View>
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
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actions: { flexDirection: 'row', gap: 8 },
});

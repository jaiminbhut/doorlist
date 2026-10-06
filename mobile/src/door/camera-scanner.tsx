import { CameraView, useCameraPermissions } from 'expo-camera';
import { Linking, StyleSheet, View } from 'react-native';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { radius, size, usePalette } from '@/theme';

/**
 * The camera, reading QR codes only. Every code it sees goes to onCode; the
 * console decides what to do with repeats (ScanLock). Without permission, it
 * explains, and the code field below still works.
 */
export function CameraScanner({ onCode }: { onCode(code: string): void }) {
  const palette = usePalette();
  const [permission, requestPermission] = useCameraPermissions();

  if (permission?.granted) {
    return (
      <View style={[styles.frame, { borderColor: palette.consoleLine }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => onCode(data)}
        />
        <View pointerEvents="none" style={styles.aim}>
          <View style={[styles.reticle, { borderColor: palette.consoleStamp }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.frame, styles.off, { borderColor: palette.consoleLine }]}>
      <Text variant="bold" style={{ color: palette.consoleInk }}>
        The camera is off
      </Text>
      <Text style={[styles.note, { color: palette.consoleSoft }]}>
        Allow the camera to scan QR codes. A code can also be typed, pasted, or sent by a Bluetooth
        scanner into the field below.
      </Text>
      {permission ? (
        <Button
          label={permission.canAskAgain ? 'Allow the camera' : 'Open Settings'}
          onPress={() =>
            permission.canAskAgain ? void requestPermission() : void Linking.openSettings()
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 260,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.surface,
    backgroundColor: '#000000',
  },
  off: { justifyContent: 'center', gap: 10, padding: 20, backgroundColor: 'transparent' },
  note: { fontSize: size.small, lineHeight: size.small * 1.5 },
  aim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: { width: 180, height: 180, borderWidth: 3, borderRadius: 18, opacity: 0.85 },
});

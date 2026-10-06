// The camera for tests: always allowed, and a view whose onBarcodeScanned a
// test can call as if a QR code had come into view.
import { View, type ViewProps } from 'react-native';

export const useCameraPermissions = jest.fn(() => [
  { granted: true, canAskAgain: true, status: 'granted' },
  jest.fn(),
]);

export function CameraView(
  props: ViewProps & { onBarcodeScanned?: (scan: { data: string }) => void },
) {
  return <View testID="camera" {...props} />;
}

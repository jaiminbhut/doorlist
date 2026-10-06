// Haptics for tests: recorded, not felt.
export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export const notificationAsync = jest.fn(async (_type: NotificationFeedbackType) => undefined);

type ProfileListener = () => void;
const listeners: Set<ProfileListener> = new Set();

export function subscribeToProfileUpdates(callback: ProfileListener) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function notifyProfileUpdate() {
  listeners.forEach(callback => callback());
}

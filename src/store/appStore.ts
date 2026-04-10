export type AppState = {
  loading: boolean;
};

const appState: AppState = {
  loading: false,
};

export function setGlobalLoading(value: boolean) {
  appState.loading = value;
}

export function getAppState() {
  return appState;
}

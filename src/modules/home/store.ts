type HomeState = {
  keyword: string;
};

const state: HomeState = {
  keyword: '',
};

export function setHomeKeyword(keyword: string) {
  state.keyword = keyword;
}

export function getHomeState() {
  return state;
}

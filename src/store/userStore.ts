export type UserInfo = {
  id: string;
  nickname: string;
};

let user: UserInfo | null = null;

export function setUser(next: UserInfo | null) {
  user = next;
}

export function getUser() {
  return user;
}

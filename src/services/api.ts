import { request } from './request';

export type HealthResponse = {
  status: 'ok' | 'error';
  timestamp: string;
};

export function getHealth() {
  return request<HealthResponse>('/health');
}

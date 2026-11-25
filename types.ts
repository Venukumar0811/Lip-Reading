
export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface TranscriptionItem {
  id: string;
  text: string;
  timestamp: Date;
  isFinal: boolean;
  speaker: 'user' | 'model';
}

export interface AudioConfig {
  sampleRate: number;
  channels: number;
}

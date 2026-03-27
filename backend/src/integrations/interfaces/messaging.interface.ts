export interface MessagingPayload {
  to: string;
  message: string;
}

export interface MessagingSendResult {
  id: string;
  success: boolean;
}

export interface IMessagingClient {
  send(payload: MessagingPayload): Promise<MessagingSendResult>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailSendResult {
  id: string;
  success: boolean;
}

export interface IEmailClient {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

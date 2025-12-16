// Common interface for all sending platform integrations

export interface MailboxData {
  email: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
}

export interface SendingPlatformClient {
  /**
   * Validate that an API key is valid for this platform
   */
  validateApiKey(apiKey: string): Promise<boolean>;

  /**
   * Add a mailbox to the sending platform
   * Returns the external ID assigned by the platform
   */
  addMailbox(apiKey: string, mailbox: MailboxData): Promise<{ externalId: string }>;

  /**
   * Remove a mailbox from the sending platform
   */
  removeMailbox(apiKey: string, externalId: string): Promise<void>;

  /**
   * List all mailboxes on the platform
   */
  listMailboxes(apiKey: string): Promise<MailboxData[]>;
}


// Common interface for all sending platform integrations

export interface MailboxData {
  email: string;
  firstName: string;
  lastName: string;
  profilePictureUrl?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface SendingPlatformClient {
  /**
   * Validate that an API key is valid for this platform
   * @param apiKey - The API key to validate
   * @param baseUrl - Optional custom base URL (used by EmailBison for dedicated instances)
   * @returns ValidationResult with valid flag and optional error message
   */
  validateApiKey(apiKey: string, baseUrl?: string): Promise<ValidationResult>;

  /**
   * Add a mailbox to the sending platform
   * Returns the external ID assigned by the platform
   */
  addMailbox(apiKey: string, mailbox: MailboxData, baseUrl?: string): Promise<{ externalId: string }>;

  /**
   * Remove a mailbox from the sending platform
   */
  removeMailbox(apiKey: string, externalId: string, baseUrl?: string): Promise<void>;

  /**
   * List all mailboxes on the platform
   */
  listMailboxes(apiKey: string, baseUrl?: string): Promise<MailboxData[]>;
}


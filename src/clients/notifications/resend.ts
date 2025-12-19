import { Resend } from 'resend';
import { env } from '../../config/env.js';

// Initialize Resend client
const resend = new Resend(env.RESEND_API_KEY);

// Default sender
const defaultFrom = `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;

// ============================================================
// Core Send Function
// ============================================================

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const { to, subject, html, text, from, replyTo, tags } = options;

  const { data, error } = await resend.emails.send({
    from: from || defaultFrom,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
    replyTo,
    tags,
  });

  if (error) {
    console.error('[Resend] Failed to send email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log(`[Resend] Email sent: ${data?.id} to ${Array.isArray(to) ? to.join(', ') : to}`);
  return { id: data?.id || '' };
}

// ============================================================
// Transactional Email Helpers
// ============================================================

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmation(
  to: string,
  data: {
    orderId: string;
    domainCount: number;
    mailboxCount: number;
    totalAmount: number;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: 'Order Confirmed - CheapInboxes',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #18181b; font-size: 24px; margin-bottom: 24px;">Order Confirmed</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Thanks for your order! We're setting everything up for you.
        </p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0; color: #71717a; font-size: 14px;">Order #${data.orderId.slice(0, 8)}</p>
          <p style="margin: 0 0 4px 0; color: #18181b; font-size: 16px;"><strong>${data.domainCount}</strong> domain${data.domainCount !== 1 ? 's' : ''}</p>
          <p style="margin: 0 0 4px 0; color: #18181b; font-size: 16px;"><strong>${data.mailboxCount}</strong> mailbox${data.mailboxCount !== 1 ? 'es' : ''}</p>
          <p style="margin: 16px 0 0 0; color: #18181b; font-size: 20px; font-weight: 600;">$${data.totalAmount.toFixed(2)}</p>
        </div>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          You'll receive another email once your mailboxes are ready to use.
        </p>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Order Confirmed\n\nThanks for your order!\n\nOrder #${data.orderId.slice(0, 8)}\n${data.domainCount} domain(s)\n${data.mailboxCount} mailbox(es)\nTotal: $${data.totalAmount.toFixed(2)}\n\nYou'll receive another email once your mailboxes are ready.`,
    tags: [{ name: 'type', value: 'order_confirmation' }],
  });
}

/**
 * Send mailboxes ready notification
 */
export async function sendMailboxesReady(
  to: string,
  data: {
    mailboxCount: number;
    domains: string[];
  }
): Promise<{ id: string }> {
  const domainList = data.domains.map(d => `<li style="color: #18181b;">${d}</li>`).join('');
  
  return sendEmail({
    to,
    subject: 'Your Mailboxes Are Ready! - CheapInboxes',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #18181b; font-size: 24px; margin-bottom: 24px;">Your Mailboxes Are Ready!</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Great news! Your <strong>${data.mailboxCount}</strong> mailbox${data.mailboxCount !== 1 ? 'es are' : ' is'} now active and ready to use.
        </p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 12px 0; color: #71717a; font-size: 14px; font-weight: 500;">Domains:</p>
          <ul style="margin: 0; padding-left: 20px;">
            ${domainList}
          </ul>
        </div>
        <a href="https://app.cheapinboxes.com/mailboxes" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
          View Your Mailboxes
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Your Mailboxes Are Ready!\n\nYour ${data.mailboxCount} mailbox(es) are now active.\n\nDomains:\n${data.domains.map(d => `- ${d}`).join('\n')}\n\nView them at: https://app.cheapinboxes.com/mailboxes`,
    tags: [{ name: 'type', value: 'mailboxes_ready' }],
  });
}

/**
 * Send payment failed notification
 */
export async function sendPaymentFailed(
  to: string,
  data: {
    amount: number;
    nextRetryDate?: string;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: 'Payment Failed - Action Required - CheapInboxes',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 24px;">Payment Failed</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          We couldn't process your payment of <strong>$${data.amount.toFixed(2)}</strong>.
        </p>
        ${data.nextRetryDate ? `
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          We'll automatically retry on <strong>${data.nextRetryDate}</strong>.
        </p>
        ` : ''}
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Please update your payment method to avoid any service interruption.
        </p>
        <a href="https://app.cheapinboxes.com/billing" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          Update Payment Method
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Payment Failed\n\nWe couldn't process your payment of $${data.amount.toFixed(2)}.\n\n${data.nextRetryDate ? `We'll retry on ${data.nextRetryDate}.\n\n` : ''}Please update your payment method: https://app.cheapinboxes.com/billing`,
    tags: [{ name: 'type', value: 'payment_failed' }],
  });
}

/**
 * Send domain expiring warning
 */
export async function sendDomainExpiringWarning(
  to: string,
  data: {
    domain: string;
    expiresAt: string;
    daysLeft: number;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: `Domain Expiring Soon: ${data.domain} - CheapInboxes`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f59e0b; font-size: 24px; margin-bottom: 24px;">Domain Expiring Soon</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Your domain <strong>${data.domain}</strong> will expire in <strong>${data.daysLeft} day${data.daysLeft !== 1 ? 's' : ''}</strong> (${data.expiresAt}).
        </p>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          If auto-renew is enabled, we'll automatically renew it. Otherwise, please renew manually to keep your mailboxes active.
        </p>
        <a href="https://app.cheapinboxes.com/domains" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          Manage Domain
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Domain Expiring Soon\n\nYour domain ${data.domain} will expire in ${data.daysLeft} day(s) (${data.expiresAt}).\n\nManage it at: https://app.cheapinboxes.com/domains`,
    tags: [{ name: 'type', value: 'domain_expiring' }],
  });
}

/**
 * Send welcome email after signup
 */
export async function sendWelcome(
  to: string,
  data: {
    name?: string;
  }
): Promise<{ id: string }> {
  const greeting = data.name ? `Hi ${data.name}!` : 'Welcome!';
  
  return sendEmail({
    to,
    subject: 'Welcome to CheapInboxes!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #18181b; font-size: 24px; margin-bottom: 24px;">${greeting}</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Thanks for signing up for CheapInboxes. We're excited to help you scale your email outreach.
        </p>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Here's what you can do:
        </p>
        <ul style="color: #52525b; font-size: 16px; line-height: 1.8;">
          <li>Register domains for your campaigns</li>
          <li>Provision Google Workspace or Microsoft 365 mailboxes</li>
          <li>Connect to Instantly, Smartlead, or other sending platforms</li>
        </ul>
        <a href="https://app.cheapinboxes.com/shop" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          Get Started
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          Questions? Just reply to this email.
          <br><br>
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `${greeting}\n\nThanks for signing up for CheapInboxes. We're excited to help you scale your email outreach.\n\nGet started: https://app.cheapinboxes.com/shop`,
    replyTo: 'support@cheapinboxes.com',
    tags: [{ name: 'type', value: 'welcome' }],
  });
}

/**
 * Send domain registered notification
 */
export async function sendDomainRegistered(
  to: string,
  data: {
    domain: string;
    registrar?: string;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: `Domain Registered: ${data.domain} - CheapInboxes`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #22c55e; font-size: 24px; margin-bottom: 24px;">Domain Registered</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Your domain <strong>${data.domain}</strong> has been successfully registered${data.registrar ? ` via ${data.registrar}` : ''}.
        </p>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          DNS records are being configured automatically. You'll receive another notification when your mailboxes are ready.
        </p>
        <a href="https://app.cheapinboxes.com/domains" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          View Domain
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Domain Registered\n\nYour domain ${data.domain} has been registered.\n\nView at: https://app.cheapinboxes.com/domains`,
    tags: [{ name: 'type', value: 'domain_registered' }],
  });
}

/**
 * Send provisioning failed notification
 */
export async function sendProvisioningFailed(
  to: string,
  data: {
    domain: string;
    mailboxCount: number;
    reason: string;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: `Provisioning Issue: ${data.domain} - CheapInboxes`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 24px;">Provisioning Issue</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          We encountered an issue while setting up ${data.mailboxCount} mailbox${data.mailboxCount !== 1 ? 'es' : ''} for <strong>${data.domain}</strong>.
        </p>
        <div style="background: #fef2f2; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0; color: #dc2626; font-size: 14px; font-weight: 500;">Issue Details</p>
          <p style="margin: 0; color: #18181b; font-size: 16px;">${data.reason}</p>
        </div>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Our team has been notified and is working on it. We'll update you once it's resolved.
        </p>
        <a href="https://app.cheapinboxes.com/domains" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          View Status
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Provisioning Issue\n\nWe encountered an issue setting up ${data.mailboxCount} mailbox(es) for ${data.domain}.\n\nReason: ${data.reason}\n\nOur team is working on it.`,
    tags: [{ name: 'type', value: 'provisioning_failed' }],
  });
}

/**
 * Send team member invited notification
 */
export async function sendTeamMemberInvited(
  to: string,
  data: {
    inviterName: string;
    orgName: string;
    inviteLink: string;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: `You've been invited to ${data.orgName} - CheapInboxes`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #18181b; font-size: 24px; margin-bottom: 24px;">You're Invited!</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          <strong>${data.inviterName}</strong> has invited you to join <strong>${data.orgName}</strong> on CheapInboxes.
        </p>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Click the button below to accept the invitation and get started.
        </p>
        <a href="${data.inviteLink}" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          Accept Invitation
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          If you didn't expect this invitation, you can safely ignore this email.
          <br><br>
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `You're Invited!\n\n${data.inviterName} has invited you to join ${data.orgName} on CheapInboxes.\n\nAccept invitation: ${data.inviteLink}`,
    tags: [{ name: 'type', value: 'team_invite' }],
  });
}

/**
 * Send integration connected notification
 */
export async function sendIntegrationConnected(
  to: string,
  data: {
    platformName: string;
    mailboxCount: number;
  }
): Promise<{ id: string }> {
  return sendEmail({
    to,
    subject: `${data.platformName} Connected - CheapInboxes`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #22c55e; font-size: 24px; margin-bottom: 24px;">Integration Connected</h1>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Your <strong>${data.platformName}</strong> integration is now connected.
        </p>
        <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #18181b; font-size: 16px;">
            <strong>${data.mailboxCount}</strong> mailbox${data.mailboxCount !== 1 ? 'es' : ''} synced to ${data.platformName}
          </p>
        </div>
        <p style="color: #52525b; font-size: 16px; line-height: 1.6;">
          Your mailboxes are now available in ${data.platformName} for use in your campaigns.
        </p>
        <a href="https://app.cheapinboxes.com/mailboxes" style="display: inline-block; background: #18181b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin-top: 16px;">
          View Mailboxes
        </a>
        <p style="color: #71717a; font-size: 14px; margin-top: 32px;">
          — The CheapInboxes Team
        </p>
      </div>
    `,
    text: `Integration Connected\n\nYour ${data.platformName} integration is connected.\n\n${data.mailboxCount} mailbox(es) synced.\n\nView at: https://app.cheapinboxes.com/mailboxes`,
    tags: [{ name: 'type', value: 'integration_connected' }],
  });
}

export { resend };


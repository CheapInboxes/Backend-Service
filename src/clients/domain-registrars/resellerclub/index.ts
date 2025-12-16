/**
 * ResellerClub HTTP API Client
 *
 * API Documentation: https://manage.resellerclub.com/kb/answer/744
 *
 * Base URLs:
 * - Production: https://httpapi.com/
 * - Test: https://test.httpapi.com/
 *
 * Authentication:
 * All requests require:
 * - auth-userid: Your Reseller ID
 * - api-key: Your API Key
 *
 * Important: IP addresses must be whitelisted in the ResellerClub control panel
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ResellerClubConfig {
  authUserId: string;
  apiKey: string;
  sandbox?: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// Invoice Options
export type InvoiceOption = 'NoInvoice' | 'PayInvoice' | 'KeepInvoice' | 'OnlyAdd';

// ============================================================================
// Domain Types
// ============================================================================

export interface DomainAvailabilityResult {
  [domain: string]: {
    status: 'available' | 'regthroughus' | 'regthroughothers' | 'unknown';
    classkey?: string;
  };
}

export interface DomainRegisterParams {
  domainName: string;
  years: number;
  nameServers: string[];
  customerId: number;
  registrantContactId: number;
  adminContactId: number;
  techContactId: number;
  billingContactId: number;
  invoiceOption: InvoiceOption;
  purchasePrivacy?: boolean;
  protectPrivacy?: boolean;
  autoRenew?: boolean;
}

export interface DomainTransferParams {
  domainName: string;
  authCode: string;
  customerId: number;
  registrantContactId: number;
  adminContactId: number;
  techContactId: number;
  billingContactId: number;
  invoiceOption: InvoiceOption;
  purchasePrivacy?: boolean;
  protectPrivacy?: boolean;
  autoRenew?: boolean;
}

export interface DomainRenewParams {
  orderId: number;
  years: number;
  expDate: number; // Current expiry timestamp
  invoiceOption: InvoiceOption;
  purchasePrivacy?: boolean;
  autoRenew?: boolean;
}

export interface DomainDetails {
  orderid: number;
  domainname: string;
  currentstatus: string;
  creationtime: number;
  endtime: number;
  registrantcontact: ContactDetails;
  admincontact: ContactDetails;
  techcontact: ContactDetails;
  billingcontact: ContactDetails;
  ns1: string;
  ns2: string;
  ns3?: string;
  ns4?: string;
  orderstatus: string[];
  privacyprotectedallowed: boolean;
  isprivacyprotected: boolean;
  isOrderSuspendedUponExpiry: boolean;
  orderSuspendedByParent: boolean;
  allowdeletion: boolean;
  domainstatus: string[];
}

// ============================================================================
// Customer Types
// ============================================================================

export interface CustomerCreateParams {
  username: string; // Email address
  password: string;
  name: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  city: string;
  state: string;
  country: string; // Two-letter country code
  zipcode: string;
  phoneCountryCode: string;
  phone: string;
  langPref?: string;
}

export interface CustomerDetails {
  customerid: number;
  username: string;
  name: string;
  company: string;
  address1: string;
  address2?: string;
  address3?: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  telnocc: string;
  telno: string;
  langpref: string;
  totalreceipts: number;
  parentid: number;
  pin: string;
  creationdt: string;
}

// ============================================================================
// Contact Types
// ============================================================================

export interface ContactCreateParams {
  name: string;
  company: string;
  email: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
  phoneCountryCode: string;
  phone: string;
  faxCountryCode?: string;
  fax?: string;
  customerId: number;
  type: 'Contact' | 'CoopContact' | 'UkContact' | 'EuContact' | 'CnContact' | 'CoContact' | 'CaContact' | 'DeContact' | 'EsContact' | 'RuContact';
}

export interface ContactDetails {
  contactid: number;
  name: string;
  company: string;
  emailaddr: string;
  address1: string;
  address2?: string;
  address3?: string;
  city: string;
  state: string;
  country: string;
  zip: string;
  telnocc: string;
  telno: string;
  faxnocc?: string;
  faxno?: string;
  type: string;
  parentkey: number;
}

// ============================================================================
// Business Email Types
// ============================================================================

export interface BusinessEmailAddParams {
  domainName: string;
  customerId: number;
  months: number;
  numberOfAccounts: number;
  invoiceOption: InvoiceOption;
  autoRenew?: boolean;
}

export interface BusinessEmailRenewParams {
  orderId: number;
  months: number;
  numberOfAccounts: number;
  invoiceOption: InvoiceOption;
  autoRenew?: boolean;
}

export interface BusinessEmailAddAccountParams {
  orderId: number;
  numberOfAccounts: number;
  invoiceOption: InvoiceOption;
}

export interface BusinessEmailDeleteAccountParams {
  orderId: number;
  numberOfAccounts: number;
}

export interface BusinessEmailOrderDetails {
  orderid: number;
  domainname: string;
  currentstatus: string;
  creationtime: number;
  endtime: number;
  noofaccounts: number;
  ordertype: string;
  paused: boolean;
  orderstatus: string[];
}

// ============================================================================
// Enterprise Email Types
// ============================================================================

export interface EnterpriseEmailAddParams {
  domainName: string;
  customerId: number;
  months: number;
  numberOfAccounts: number;
  invoiceOption: InvoiceOption;
  autoRenew?: boolean;
}

export interface EnterpriseEmailAddAccountParams {
  orderId: number;
  numberOfAccounts: number;
  invoiceOption: InvoiceOption;
}

// ============================================================================
// Titan Email Types
// ============================================================================

export interface TitanEmailAddParams {
  domainName: string;
  customerId: number;
  months: number;
  planId: number;
  invoiceOption: InvoiceOption;
  autoRenew?: boolean;
}

// ============================================================================
// DNS Types
// ============================================================================

export interface DnsRecordParams {
  orderId: number;
  host: string;
  value: string;
  ttl?: number;
}

export interface MxRecordParams extends DnsRecordParams {
  priority: number;
}

// ============================================================================
// Pricing Types
// ============================================================================

export interface PricingResponse {
  [productKey: string]: {
    [action: string]: {
      [duration: string]: number;
    };
  };
}

// ============================================================================
// Product Keys
// ============================================================================

export const PRODUCT_KEYS = {
  // Domains
  DOMAIN_COM: 'domcno',
  DOMAIN_NET: 'domnet',
  DOMAIN_ORG: 'domorg',
  DOMAIN_INFO: 'dominfo',
  DOMAIN_BIZ: 'dombiz',
  DOMAIN_CO: 'domco',
  DOMAIN_IO: 'domio',

  // Email
  BUSINESS_EMAIL_US: 'eeliteus',
  ENTERPRISE_EMAIL_US: 'enterpriseemailus',
  ENTERPRISE_EMAIL_IN: 'enterpriseemailin',
  TITAN_EMAIL_INDIA: 'titanmailindia',

  // Hosting
  HOSTING: 'hosting',
  RESELLER_HOSTING: 'resellerhosting',
  VPS: 'vps',
  DEDICATED_SERVER: 'dedicatedserver',

  // SSL
  SSL: 'ssl',

  // DNS
  PREMIUM_DNS: 'premiumdns',

  // Website Builder
  WEBSITE_BUILDER: 'websitebuilder',
} as const;

// ============================================================================
// ResellerClub Client Class
// ============================================================================

export class ResellerClubClient {
  private client: AxiosInstance;
  private authUserId: string;
  private apiKey: string;

  constructor(config: ResellerClubConfig) {
    this.authUserId = config.authUserId;
    this.apiKey = config.apiKey;

    const baseURL = config.sandbox
      ? 'https://test.httpapi.com/api'
      : 'https://httpapi.com/api';

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CheapInboxes/1.0 (Domain Registration Service)',
        'Accept': 'application/json',
      },
      // ResellerClub expects repeated params for arrays: tlds=com&tlds=net&tlds=org
      paramsSerializer: {
        serialize: (params) => {
          const parts: string[] = [];
          for (const key in params) {
            const value = params[key];
            if (Array.isArray(value)) {
              value.forEach((v) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
            } else if (value !== null && value !== undefined) {
              parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
            }
          }
          return parts.join('&');
        },
      },
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getAuthParams(): Record<string, string> {
    return {
      'auth-userid': this.authUserId,
      'api-key': this.apiKey,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    params: Record<string, unknown> = {}
  ): Promise<ApiResponse<T>> {
    try {
      const allParams = { ...this.getAuthParams(), ...params };
      
      // Debug logging
      console.log(`[ResellerClub] ${method} ${this.client.defaults.baseURL}${endpoint}`);
      console.log('[ResellerClub] Params:', JSON.stringify(params, null, 2));

      const response =
        method === 'GET'
          ? await this.client.get(endpoint, { params: allParams })
          : await this.client.post(endpoint, new URLSearchParams(allParams as Record<string, string>).toString(), {
              params: this.getAuthParams(),
            });

      console.log('[ResellerClub] Response:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const axiosError = error as AxiosError<{ status: string; message: string }>;
      console.error('[ResellerClub] Error:', axiosError.response?.data || axiosError.message);
      return {
        success: false,
        error: axiosError.response?.data?.message || axiosError.message,
        errorCode: axiosError.response?.data?.status,
      };
    }
  }

  // ==========================================================================
  // DOMAIN APIs
  // https://manage.resellerclub.com/kb/answer/764
  // ==========================================================================

  /**
   * Check domain availability
   * @see https://manage.resellerclub.com/kb/answer/764
   */
  async checkDomainAvailability(
    domainName: string,
    tlds: string[]
  ): Promise<ApiResponse<DomainAvailabilityResult>> {
    return this.request('GET', '/domains/available.json', {
      'domain-name': domainName,
      tlds: tlds, // Pass as array - paramsSerializer will handle repeated params
    });
  }

  /**
   * Check availability for IDN domains
   * @see https://manage.resellerclub.com/kb/answer/1427
   */
  async checkIdnDomainAvailability(
    domainName: string,
    tld: string,
    idnLanguageCode: string
  ): Promise<ApiResponse<DomainAvailabilityResult>> {
    return this.request('GET', '/domains/idn-available.json', {
      'domain-name': domainName,
      tld,
      'idn-language-code': idnLanguageCode,
    });
  }

  /**
   * Check availability for premium domains
   * @see https://manage.resellerclub.com/kb/answer/1948
   */
  async checkPremiumDomainAvailability(
    keyword: string,
    tlds: string[]
  ): Promise<ApiResponse<DomainAvailabilityResult>> {
    return this.request('GET', '/domains/premium/available.json', {
      'key-word': keyword,
      tlds: tlds, // Pass as array - paramsSerializer will handle repeated params
    });
  }

  /**
   * Suggest domain names
   * @see https://manage.resellerclub.com/kb/answer/1085
   */
  async suggestDomainNames(
    keyword: string,
    tldOnly?: string[],
    exactMatch?: boolean
  ): Promise<ApiResponse<string[]>> {
    return this.request('GET', '/domains/v5/suggest-names.json', {
      'keyword': keyword,
      ...(tldOnly && { 'tld-only': tldOnly }), // Pass as array - paramsSerializer will handle repeated params
      ...(exactMatch !== undefined && { 'exact-match': exactMatch }),
    });
  }

  /**
   * Register a domain
   * @see https://manage.resellerclub.com/kb/answer/752
   */
  async registerDomain(params: DomainRegisterParams): Promise<ApiResponse<{ entityid: number; actiontypedesc: string }>> {
    return this.request('POST', '/domains/register.json', {
      'domain-name': params.domainName,
      years: params.years,
      ns: params.nameServers.join(','),
      'customer-id': params.customerId,
      'reg-contact-id': params.registrantContactId,
      'admin-contact-id': params.adminContactId,
      'tech-contact-id': params.techContactId,
      'billing-contact-id': params.billingContactId,
      'invoice-option': params.invoiceOption,
      ...(params.purchasePrivacy !== undefined && { 'purchase-privacy': params.purchasePrivacy }),
      ...(params.protectPrivacy !== undefined && { 'protect-privacy': params.protectPrivacy }),
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Transfer a domain
   * @see https://manage.resellerclub.com/kb/answer/758
   */
  async transferDomain(params: DomainTransferParams): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/domains/transfer.json', {
      'domain-name': params.domainName,
      'auth-code': params.authCode,
      'customer-id': params.customerId,
      'reg-contact-id': params.registrantContactId,
      'admin-contact-id': params.adminContactId,
      'tech-contact-id': params.techContactId,
      'billing-contact-id': params.billingContactId,
      'invoice-option': params.invoiceOption,
      ...(params.purchasePrivacy !== undefined && { 'purchase-privacy': params.purchasePrivacy }),
      ...(params.protectPrivacy !== undefined && { 'protect-privacy': params.protectPrivacy }),
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Submit auth code for transfer
   * @see https://manage.resellerclub.com/kb/answer/766
   */
  async submitTransferAuthCode(orderId: number, authCode: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/transfer/submit-auth-code.json', {
      'order-id': orderId,
      'auth-code': authCode,
    });
  }

  /**
   * Renew a domain
   * @see https://manage.resellerclub.com/kb/answer/746
   */
  async renewDomain(params: DomainRenewParams): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/domains/renew.json', {
      'order-id': params.orderId,
      years: params.years,
      'exp-date': params.expDate,
      'invoice-option': params.invoiceOption,
      ...(params.purchasePrivacy !== undefined && { 'purchase-privacy': params.purchasePrivacy }),
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Search domains
   * @see https://manage.resellerclub.com/kb/answer/771
   */
  async searchDomains(
    options: {
      noOfRecords?: number;
      pageNo?: number;
      customerId?: number;
      domainName?: string;
      status?: string[];
      orderBy?: string;
    } = {}
  ): Promise<ApiResponse<{ recsonpage: number; recsindb: number; orders: DomainDetails[] }>> {
    return this.request('GET', '/domains/search.json', {
      'no-of-records': options.noOfRecords || 10,
      'page-no': options.pageNo || 1,
      ...(options.customerId && { 'customer-id': options.customerId }),
      ...(options.domainName && { 'domain-name': options.domainName }),
      ...(options.status && { 'status': options.status.join(',') }),
      ...(options.orderBy && { 'order-by': options.orderBy }),
    });
  }

  /**
   * Get order ID by domain name
   * @see https://manage.resellerclub.com/kb/answer/1755
   */
  async getDomainOrderId(domainName: string): Promise<ApiResponse<number>> {
    return this.request('GET', '/domains/orderid.json', {
      'domain-name': domainName,
    });
  }

  /**
   * Get domain details by order ID
   * @see https://manage.resellerclub.com/kb/answer/770
   */
  async getDomainDetails(orderId: number): Promise<ApiResponse<DomainDetails>> {
    return this.request('GET', '/domains/details.json', {
      'order-id': orderId,
      options: 'All',
    });
  }

  /**
   * Get domain details by domain name
   * @see https://manage.resellerclub.com/kb/answer/1756
   */
  async getDomainDetailsByName(domainName: string): Promise<ApiResponse<DomainDetails>> {
    return this.request('GET', '/domains/details-by-name.json', {
      'domain-name': domainName,
      options: 'All',
    });
  }

  /**
   * Modify name servers
   * @see https://manage.resellerclub.com/kb/answer/772
   */
  async modifyNameServers(orderId: number, nameServers: string[]): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/modify-ns.json', {
      'order-id': orderId,
      ns: nameServers.join(','),
    });
  }

  /**
   * Add child name server
   * @see https://manage.resellerclub.com/kb/answer/773
   */
  async addChildNameServer(orderId: number, cns: string, ip: string[]): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/add-cns.json', {
      'order-id': orderId,
      cns,
      ip: ip.join(','),
    });
  }

  /**
   * Modify contacts
   * @see https://manage.resellerclub.com/kb/answer/778
   */
  async modifyDomainContacts(
    orderId: number,
    regContactId: number,
    adminContactId: number,
    techContactId: number,
    billingContactId: number
  ): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/modify-contact.json', {
      'order-id': orderId,
      'reg-contact-id': regContactId,
      'admin-contact-id': adminContactId,
      'tech-contact-id': techContactId,
      'billing-contact-id': billingContactId,
    });
  }

  /**
   * Enable theft protection lock
   * @see https://manage.resellerclub.com/kb/answer/781
   */
  async enableTheftProtection(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/enable-theft-protection.json', {
      'order-id': orderId,
    });
  }

  /**
   * Disable theft protection lock
   * @see https://manage.resellerclub.com/kb/answer/782
   */
  async disableTheftProtection(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/disable-theft-protection.json', {
      'order-id': orderId,
    });
  }

  /**
   * Get locks applied on domain
   * @see https://manage.resellerclub.com/kb/answer/792
   */
  async getDomainLocks(orderId: number): Promise<ApiResponse<string[]>> {
    return this.request('GET', '/domains/locks.json', {
      'order-id': orderId,
    });
  }

  /**
   * Get customer default name servers
   * @see https://manage.resellerclub.com/kb/answer/1758
   */
  async getCustomerDefaultNameServers(customerId: number): Promise<ApiResponse<string[]>> {
    return this.request('GET', '/domains/customer-default-ns.json', {
      'customer-id': customerId,
    });
  }

  /**
   * Delete domain
   * @see https://manage.resellerclub.com/kb/answer/1757
   */
  async deleteDomain(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/domains/delete.json', {
      'order-id': orderId,
    });
  }

  // ==========================================================================
  // CUSTOMER APIs
  // https://manage.resellerclub.com/kb/answer/804
  // ==========================================================================

  /**
   * Create a customer
   * @see https://manage.resellerclub.com/kb/answer/804
   */
  async createCustomer(params: CustomerCreateParams): Promise<ApiResponse<number>> {
    return this.request('POST', '/customers/v2/signup.json', {
      username: params.username,
      passwd: params.password,
      name: params.name,
      ...(params.company && { company: params.company }),
      'address-line-1': params.addressLine1,
      ...(params.addressLine2 && { 'address-line-2': params.addressLine2 }),
      ...(params.addressLine3 && { 'address-line-3': params.addressLine3 }),
      city: params.city,
      state: params.state,
      country: params.country,
      zipcode: params.zipcode,
      'phone-cc': params.phoneCountryCode,
      phone: params.phone,
      'lang-pref': params.langPref || 'en',
    });
  }

  /**
   * Get customer details by ID
   * @see https://manage.resellerclub.com/kb/answer/805
   */
  async getCustomerDetails(customerId: number): Promise<ApiResponse<CustomerDetails>> {
    return this.request('GET', '/customers/details.json', {
      'customer-id': customerId,
    });
  }

  /**
   * Get customer details by username
   * @see https://manage.resellerclub.com/kb/answer/806
   */
  async getCustomerDetailsByUsername(username: string): Promise<ApiResponse<CustomerDetails>> {
    return this.request('GET', '/customers/details-by-id.json', {
      username,
    });
  }

  /**
   * Get customer ID by username
   * @see https://manage.resellerclub.com/kb/answer/874
   */
  async getCustomerId(username: string): Promise<ApiResponse<number>> {
    return this.request('GET', '/customers/customer-id.json', {
      username,
    });
  }

  /**
   * Modify customer details
   * @see https://manage.resellerclub.com/kb/answer/807
   */
  async modifyCustomer(
    customerId: number,
    params: Partial<CustomerCreateParams>
  ): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/customers/modify.json', {
      'customer-id': customerId,
      ...(params.username && { username: params.username }),
      ...(params.name && { name: params.name }),
      ...(params.company && { company: params.company }),
      ...(params.addressLine1 && { 'address-line-1': params.addressLine1 }),
      ...(params.addressLine2 && { 'address-line-2': params.addressLine2 }),
      ...(params.addressLine3 && { 'address-line-3': params.addressLine3 }),
      ...(params.city && { city: params.city }),
      ...(params.state && { state: params.state }),
      ...(params.country && { country: params.country }),
      ...(params.zipcode && { zipcode: params.zipcode }),
      ...(params.phoneCountryCode && { 'phone-cc': params.phoneCountryCode }),
      ...(params.phone && { phone: params.phone }),
      ...(params.langPref && { 'lang-pref': params.langPref }),
    });
  }

  /**
   * Change customer password
   * @see https://manage.resellerclub.com/kb/answer/808
   */
  async changeCustomerPassword(customerId: number, newPassword: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/customers/change-password.json', {
      'customer-id': customerId,
      'new-passwd': newPassword,
    });
  }

  /**
   * Search customers
   * @see https://manage.resellerclub.com/kb/answer/811
   */
  async searchCustomers(
    options: {
      noOfRecords?: number;
      pageNo?: number;
      username?: string;
      name?: string;
      company?: string;
      city?: string;
      state?: string;
      status?: string;
    } = {}
  ): Promise<ApiResponse<{ recsonpage: number; recsindb: number; customers: CustomerDetails[] }>> {
    return this.request('GET', '/customers/search.json', {
      'no-of-records': options.noOfRecords || 10,
      'page-no': options.pageNo || 1,
      ...(options.username && { username: options.username }),
      ...(options.name && { name: options.name }),
      ...(options.company && { company: options.company }),
      ...(options.city && { city: options.city }),
      ...(options.state && { state: options.state }),
      ...(options.status && { status: options.status }),
    });
  }

  /**
   * Delete customer
   * @see https://manage.resellerclub.com/kb/answer/809
   */
  async deleteCustomer(customerId: number): Promise<ApiResponse<boolean>> {
    return this.request('POST', '/customers/delete.json', {
      'customer-id': customerId,
    });
  }

  // ==========================================================================
  // CONTACT APIs
  // https://manage.resellerclub.com/kb/answer/790
  // ==========================================================================

  /**
   * Add a contact
   * @see https://manage.resellerclub.com/kb/answer/790
   */
  async addContact(params: ContactCreateParams): Promise<ApiResponse<number>> {
    return this.request('POST', '/contacts/add.json', {
      name: params.name,
      company: params.company,
      email: params.email,
      'address-line-1': params.addressLine1,
      ...(params.addressLine2 && { 'address-line-2': params.addressLine2 }),
      ...(params.addressLine3 && { 'address-line-3': params.addressLine3 }),
      city: params.city,
      state: params.state,
      country: params.country,
      zipcode: params.zipcode,
      'phone-cc': params.phoneCountryCode,
      phone: params.phone,
      ...(params.faxCountryCode && { 'fax-cc': params.faxCountryCode }),
      ...(params.fax && { fax: params.fax }),
      'customer-id': params.customerId,
      type: params.type,
    });
  }

  /**
   * Get contact details
   * @see https://manage.resellerclub.com/kb/answer/791
   */
  async getContactDetails(contactId: number): Promise<ApiResponse<ContactDetails>> {
    return this.request('GET', '/contacts/details.json', {
      'contact-id': contactId,
    });
  }

  /**
   * Search contacts
   * @see https://manage.resellerclub.com/kb/answer/793
   */
  async searchContacts(
    customerId: number,
    options: {
      noOfRecords?: number;
      pageNo?: number;
      contactId?: number[];
      name?: string;
      company?: string;
      email?: string;
      type?: string;
      status?: string;
    } = {}
  ): Promise<ApiResponse<{ recsonpage: number; recsindb: number; contacts: ContactDetails[] }>> {
    return this.request('GET', '/contacts/search.json', {
      'customer-id': customerId,
      'no-of-records': options.noOfRecords || 10,
      'page-no': options.pageNo || 1,
      ...(options.contactId && { 'contact-id': options.contactId.join(',') }),
      ...(options.name && { name: options.name }),
      ...(options.company && { company: options.company }),
      ...(options.email && { email: options.email }),
      ...(options.type && { type: options.type }),
      ...(options.status && { status: options.status }),
    });
  }

  /**
   * Get default contact for customer
   * @see https://manage.resellerclub.com/kb/answer/2055
   */
  async getDefaultContact(customerId: number, type: string): Promise<ApiResponse<number>> {
    return this.request('GET', '/contacts/default.json', {
      'customer-id': customerId,
      type,
    });
  }

  /**
   * Modify contact
   * @see https://manage.resellerclub.com/kb/answer/794
   */
  async modifyContact(
    contactId: number,
    params: Partial<Omit<ContactCreateParams, 'customerId' | 'type'>>
  ): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/contacts/modify.json', {
      'contact-id': contactId,
      ...(params.name && { name: params.name }),
      ...(params.company && { company: params.company }),
      ...(params.email && { email: params.email }),
      ...(params.addressLine1 && { 'address-line-1': params.addressLine1 }),
      ...(params.addressLine2 && { 'address-line-2': params.addressLine2 }),
      ...(params.addressLine3 && { 'address-line-3': params.addressLine3 }),
      ...(params.city && { city: params.city }),
      ...(params.state && { state: params.state }),
      ...(params.country && { country: params.country }),
      ...(params.zipcode && { zipcode: params.zipcode }),
      ...(params.phoneCountryCode && { 'phone-cc': params.phoneCountryCode }),
      ...(params.phone && { phone: params.phone }),
      ...(params.faxCountryCode && { 'fax-cc': params.faxCountryCode }),
      ...(params.fax && { fax: params.fax }),
    });
  }

  /**
   * Delete contact
   * @see https://manage.resellerclub.com/kb/answer/795
   */
  async deleteContact(contactId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/contacts/delete.json', {
      'contact-id': contactId,
    });
  }

  // ==========================================================================
  // BUSINESS EMAIL APIs (eelite)
  // https://manage.resellerclub.com/kb/answer/2155
  // ==========================================================================

  /**
   * Add Business Email order
   * @see https://manage.resellerclub.com/kb/answer/2156
   */
  async addBusinessEmail(params: BusinessEmailAddParams): Promise<ApiResponse<{ entityid: number; actiontypedesc: string }>> {
    return this.request('POST', '/eelite/us/add.json', {
      'domain-name': params.domainName,
      'customer-id': params.customerId,
      months: params.months,
      'no-of-accounts': params.numberOfAccounts,
      'invoice-option': params.invoiceOption,
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Renew Business Email order
   * @see https://manage.resellerclub.com/kb/answer/2157
   */
  async renewBusinessEmail(params: BusinessEmailRenewParams): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/eelite/us/renew.json', {
      'order-id': params.orderId,
      months: params.months,
      'no-of-accounts': params.numberOfAccounts,
      'invoice-option': params.invoiceOption,
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Add email accounts to Business Email order
   * @see https://manage.resellerclub.com/kb/answer/2158
   */
  async addBusinessEmailAccounts(params: BusinessEmailAddAccountParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/eelite/us/add-email-account.json', {
      'order-id': params.orderId,
      'no-of-accounts': params.numberOfAccounts,
      'invoice-option': params.invoiceOption,
    });
  }

  /**
   * Delete email accounts from Business Email order
   * @see https://manage.resellerclub.com/kb/answer/2159
   */
  async deleteBusinessEmailAccounts(params: BusinessEmailDeleteAccountParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/eelite/us/delete-email-account.json', {
      'order-id': params.orderId,
      'no-of-accounts': params.numberOfAccounts,
    });
  }

  /**
   * Suspend Business Email order
   */
  async suspendBusinessEmail(orderId: number, reason: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/eelite/us/suspend.json', {
      'order-id': orderId,
      reason,
    });
  }

  /**
   * Unsuspend Business Email order
   */
  async unsuspendBusinessEmail(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/eelite/us/unsuspend.json', {
      'order-id': orderId,
    });
  }

  /**
   * Delete Business Email order
   */
  async deleteBusinessEmail(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/eelite/us/delete.json', {
      'order-id': orderId,
    });
  }

  /**
   * Get Business Email order details
   */
  async getBusinessEmailDetails(orderId: number): Promise<ApiResponse<BusinessEmailOrderDetails>> {
    return this.request('GET', '/eelite/us/details.json', {
      'order-id': orderId,
    });
  }

  /**
   * Get Business Email order ID by domain
   */
  async getBusinessEmailOrderId(domainName: string): Promise<ApiResponse<number>> {
    return this.request('GET', '/eelite/us/orderid.json', {
      'domain-name': domainName,
    });
  }

  /**
   * Search Business Email orders
   */
  async searchBusinessEmailOrders(
    options: {
      noOfRecords?: number;
      pageNo?: number;
      customerId?: number;
      domainName?: string;
      status?: string[];
      orderBy?: string;
    } = {}
  ): Promise<ApiResponse<{ recsonpage: number; recsindb: number; orders: BusinessEmailOrderDetails[] }>> {
    return this.request('GET', '/eelite/us/search.json', {
      'no-of-records': options.noOfRecords || 10,
      'page-no': options.pageNo || 1,
      ...(options.customerId && { 'customer-id': options.customerId }),
      ...(options.domainName && { 'domain-name': options.domainName }),
      ...(options.status && { 'status': options.status.join(',') }),
      ...(options.orderBy && { 'order-by': options.orderBy }),
    });
  }

  /**
   * Get Business Email customer pricing
   */
  async getBusinessEmailCustomerPricing(customerId: number): Promise<ApiResponse<PricingResponse>> {
    return this.request('GET', '/eelite/us/customer-price.json', {
      'customer-id': customerId,
    });
  }

  /**
   * Get Business Email reseller pricing
   */
  async getBusinessEmailResellerPricing(): Promise<ApiResponse<PricingResponse>> {
    return this.request('GET', '/eelite/us/reseller-price.json', {});
  }

  // ==========================================================================
  // ENTERPRISE EMAIL APIs
  // ==========================================================================

  /**
   * Add Enterprise Email order (US)
   */
  async addEnterpriseEmail(params: EnterpriseEmailAddParams): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/enterpriseemail/us/add.json', {
      'domain-name': params.domainName,
      'customer-id': params.customerId,
      months: params.months,
      'no-of-accounts': params.numberOfAccounts,
      'invoice-option': params.invoiceOption,
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Renew Enterprise Email order (US)
   */
  async renewEnterpriseEmail(orderId: number, months: number, invoiceOption: InvoiceOption): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/enterpriseemail/us/renew.json', {
      'order-id': orderId,
      months,
      'invoice-option': invoiceOption,
    });
  }

  /**
   * Add email accounts to Enterprise Email order (US)
   */
  async addEnterpriseEmailAccounts(params: EnterpriseEmailAddAccountParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/enterpriseemail/us/add-email-account.json', {
      'order-id': params.orderId,
      'no-of-accounts': params.numberOfAccounts,
      'invoice-option': params.invoiceOption,
    });
  }

  /**
   * Delete email accounts from Enterprise Email order (US)
   */
  async deleteEnterpriseEmailAccounts(orderId: number, numberOfAccounts: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/enterpriseemail/us/delete-email-account.json', {
      'order-id': orderId,
      'no-of-accounts': numberOfAccounts,
    });
  }

  /**
   * Get Enterprise Email order details (US)
   */
  async getEnterpriseEmailDetails(orderId: number): Promise<ApiResponse<BusinessEmailOrderDetails>> {
    return this.request('GET', '/enterpriseemail/us/details.json', {
      'order-id': orderId,
    });
  }

  /**
   * Get Enterprise Email order ID by domain (US)
   */
  async getEnterpriseEmailOrderId(domainName: string): Promise<ApiResponse<number>> {
    return this.request('GET', '/enterpriseemail/us/orderid.json', {
      'domain-name': domainName,
    });
  }

  // ==========================================================================
  // TITAN EMAIL APIs
  // ==========================================================================

  /**
   * Add Titan Email order
   */
  async addTitanEmail(params: TitanEmailAddParams): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/titanmail/add.json', {
      'domain-name': params.domainName,
      'customer-id': params.customerId,
      months: params.months,
      'plan-id': params.planId,
      'invoice-option': params.invoiceOption,
      ...(params.autoRenew !== undefined && { 'auto-renew': params.autoRenew }),
    });
  }

  /**
   * Renew Titan Email order
   */
  async renewTitanEmail(orderId: number, months: number, invoiceOption: InvoiceOption): Promise<ApiResponse<{ entityid: number }>> {
    return this.request('POST', '/titanmail/renew.json', {
      'order-id': orderId,
      months,
      'invoice-option': invoiceOption,
    });
  }

  /**
   * Get Titan Email order details
   */
  async getTitanEmailDetails(orderId: number): Promise<ApiResponse<BusinessEmailOrderDetails>> {
    return this.request('GET', '/titanmail/details.json', {
      'order-id': orderId,
    });
  }

  // ==========================================================================
  // DNS APIs
  // https://manage.resellerclub.com/kb/answer/2181
  // ==========================================================================

  /**
   * Activate DNS for domain
   */
  async activateDns(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/activate.json', {
      'order-id': orderId,
    });
  }

  /**
   * Add A record
   */
  async addARecord(params: DnsRecordParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/add-ipv4-record.json', {
      'order-id': params.orderId,
      host: params.host,
      value: params.value,
      ttl: params.ttl || 14400,
    });
  }

  /**
   * Add AAAA record
   */
  async addAAAARecord(params: DnsRecordParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/add-ipv6-record.json', {
      'order-id': params.orderId,
      host: params.host,
      value: params.value,
      ttl: params.ttl || 14400,
    });
  }

  /**
   * Add CNAME record
   */
  async addCnameRecord(params: DnsRecordParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/add-cname-record.json', {
      'order-id': params.orderId,
      host: params.host,
      value: params.value,
      ttl: params.ttl || 14400,
    });
  }

  /**
   * Add MX record
   */
  async addMxRecord(params: MxRecordParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/add-mx-record.json', {
      'order-id': params.orderId,
      host: params.host,
      value: params.value,
      ttl: params.ttl || 14400,
      priority: params.priority,
    });
  }

  /**
   * Add TXT record
   */
  async addTxtRecord(params: DnsRecordParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/add-txt-record.json', {
      'order-id': params.orderId,
      host: params.host,
      value: params.value,
      ttl: params.ttl || 14400,
    });
  }

  /**
   * Add SPF record
   */
  async addSpfRecord(params: DnsRecordParams): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/add-spf-record.json', {
      'order-id': params.orderId,
      host: params.host,
      value: params.value,
      ttl: params.ttl || 14400,
    });
  }

  /**
   * Delete A record
   */
  async deleteARecord(orderId: number, host: string, value: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/delete-ipv4-record.json', {
      'order-id': orderId,
      host,
      value,
    });
  }

  /**
   * Delete CNAME record
   */
  async deleteCnameRecord(orderId: number, host: string, value: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/delete-cname-record.json', {
      'order-id': orderId,
      host,
      value,
    });
  }

  /**
   * Delete MX record
   */
  async deleteMxRecord(orderId: number, host: string, value: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/delete-mx-record.json', {
      'order-id': orderId,
      host,
      value,
    });
  }

  /**
   * Delete TXT record
   */
  async deleteTxtRecord(orderId: number, host: string, value: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/dns/manage/delete-txt-record.json', {
      'order-id': orderId,
      host,
      value,
    });
  }

  // ==========================================================================
  // PRICING APIs
  // ==========================================================================

  /**
   * Get reseller pricing for all products
   */
  async getResellerPricing(): Promise<ApiResponse<PricingResponse>> {
    return this.request('GET', '/products/reseller-price.json', {});
  }

  /**
   * Get customer pricing
   */
  async getCustomerPricing(customerId: number): Promise<ApiResponse<PricingResponse>> {
    return this.request('GET', '/products/customer-price.json', {
      'customer-id': customerId,
    });
  }

  /**
   * Get reseller cost price for a specific product
   */
  async getProductResellerPrice(productKey: string): Promise<ApiResponse<PricingResponse>> {
    return this.request('GET', `/products/${productKey}/reseller-price.json`, {});
  }

  /**
   * Get customer price for a specific product
   */
  async getProductCustomerPrice(productKey: string, customerId: number): Promise<ApiResponse<PricingResponse>> {
    return this.request('GET', `/products/${productKey}/customer-price.json`, {
      'customer-id': customerId,
    });
  }

  // ==========================================================================
  // BILLING / TRANSACTION APIs
  // ==========================================================================

  /**
   * Get reseller balance
   */
  async getResellerBalance(): Promise<ApiResponse<{ sellingcurrencybalance: number; accountingcurrencybalance: number }>> {
    return this.request('GET', '/billing/reseller-balance.json', {});
  }

  /**
   * Get customer balance
   */
  async getCustomerBalance(customerId: number): Promise<ApiResponse<{ sellingcurrencybalance: number }>> {
    return this.request('GET', '/billing/customer-balance.json', {
      'customer-id': customerId,
    });
  }

  /**
   * Add funds to customer account
   */
  async addCustomerFunds(
    customerId: number,
    amount: number,
    description: string
  ): Promise<ApiResponse<{ transactionid: number }>> {
    return this.request('POST', '/billing/customer-addfunds.json', {
      'customer-id': customerId,
      amount,
      'transaction-description': description,
    });
  }

  /**
   * Search transactions
   */
  async searchTransactions(
    options: {
      noOfRecords?: number;
      pageNo?: number;
      customerId?: number;
      transactionType?: string;
      transactionDate?: string;
    } = {}
  ): Promise<ApiResponse<{ recsonpage: number; recsindb: number }>> {
    return this.request('GET', '/billing/search-transactions.json', {
      'no-of-records': options.noOfRecords || 10,
      'page-no': options.pageNo || 1,
      ...(options.customerId && { 'customer-id': options.customerId }),
      ...(options.transactionType && { 'transaction-type': options.transactionType }),
      ...(options.transactionDate && { 'transaction-date': options.transactionDate }),
    });
  }

  // ==========================================================================
  // ORDER MANAGEMENT APIs
  // ==========================================================================

  /**
   * Suspend order
   */
  async suspendOrder(orderId: number, reason: string): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/orders/suspend.json', {
      'order-id': orderId,
      reason,
    });
  }

  /**
   * Unsuspend order
   */
  async unsuspendOrder(orderId: number): Promise<ApiResponse<{ status: string }>> {
    return this.request('POST', '/orders/unsuspend.json', {
      'order-id': orderId,
    });
  }

  /**
   * Get current actions on order
   */
  async getCurrentActions(orderId: number): Promise<ApiResponse<unknown[]>> {
    return this.request('GET', '/actions/current-actions.json', {
      'order-id': orderId,
    });
  }

  /**
   * Search all orders across products
   */
  async searchAllOrders(
    options: {
      noOfRecords?: number;
      pageNo?: number;
      customerId?: number;
      productKey?: string;
      status?: string;
    } = {}
  ): Promise<ApiResponse<{ recsonpage: number; recsindb: number }>> {
    return this.request('GET', '/products/orders.json', {
      'no-of-records': options.noOfRecords || 10,
      'page-no': options.pageNo || 1,
      ...(options.customerId && { 'customer-id': options.customerId }),
      ...(options.productKey && { 'product-key': options.productKey }),
      ...(options.status && { status: options.status }),
    });
  }
}

// ============================================================================
// Factory function for creating client
// ============================================================================

export function createResellerClubClient(config: ResellerClubConfig): ResellerClubClient {
  return new ResellerClubClient(config);
}

export default ResellerClubClient;





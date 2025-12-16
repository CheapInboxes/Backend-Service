/**
 * ResellerClub API Types
 * 
 * This file contains all type definitions for the ResellerClub HTTP API.
 * These types are re-exported from the main index.ts file.
 */

// ============================================================================
// Configuration & Common Types
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

export type InvoiceOption = 'NoInvoice' | 'PayInvoice' | 'KeepInvoice' | 'OnlyAdd';

export type OrderStatus = 
  | 'InActive'
  | 'Active'
  | 'Suspended'
  | 'Pending Delete Restorable'
  | 'Deleted'
  | 'Archived'
  | 'Pending Verification'
  | 'Failed Verification';

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
  /** Additional TLD-specific attributes */
  additionalAttributes?: Record<string, string>;
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
  expDate: number;
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
  productkey?: string;
  entitytypeid?: number;
  description?: string;
  autorenew?: boolean;
  raaVerificationStatus?: string;
  raaVerificationStartTime?: number;
}

export interface DomainSearchOptions {
  noOfRecords?: number;
  pageNo?: number;
  customerId?: number;
  domainName?: string;
  status?: string[];
  orderBy?: 'orderid' | 'creationtime' | 'endtime' | 'domainname';
  expiryDateStart?: number;
  expiryDateEnd?: number;
  creationDateStart?: number;
  creationDateEnd?: number;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface CustomerCreateParams {
  username: string;
  password: string;
  name: string;
  company?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
  phoneCountryCode: string;
  phone: string;
  langPref?: string;
  altPhoneCountryCode?: string;
  altPhone?: string;
  faxCountryCode?: string;
  fax?: string;
  mobileCountryCode?: string;
  mobile?: string;
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
  twofactorauth_enabled?: boolean;
  userstatus?: string;
}

export interface CustomerSearchOptions {
  noOfRecords?: number;
  pageNo?: number;
  username?: string;
  name?: string;
  company?: string;
  city?: string;
  state?: string;
  status?: 'Active' | 'Suspended' | 'Deleted' | 'Archived';
  creationDateStart?: string;
  creationDateEnd?: string;
}

// ============================================================================
// Contact Types
// ============================================================================

export type ContactType = 
  | 'Contact'
  | 'CoopContact'
  | 'UkContact'
  | 'EuContact'
  | 'CnContact'
  | 'CoContact'
  | 'CaContact'
  | 'DeContact'
  | 'EsContact'
  | 'RuContact'
  | 'AuContact'
  | 'NlContact';

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
  type: ContactType;
  /** TLD-specific contact attributes */
  additionalAttributes?: Record<string, string>;
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
  contactstatus?: string;
}

export interface ContactSearchOptions {
  noOfRecords?: number;
  pageNo?: number;
  contactId?: number[];
  name?: string;
  company?: string;
  email?: string;
  type?: ContactType;
  status?: 'Active' | 'InActive' | 'Deleted';
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
  productkey?: string;
  customername?: string;
  customerid?: number;
}

export interface BusinessEmailSearchOptions {
  noOfRecords?: number;
  pageNo?: number;
  customerId?: number;
  domainName?: string;
  status?: string[];
  orderBy?: string;
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

export type TitanEmailPlanId = 1 | 2 | 3; // Lite, Pro, Premium typically

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

export interface DnsRecord {
  host: string;
  value: string;
  ttl: number;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SPF' | 'NS' | 'SRV';
  priority?: number;
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

export interface ProductPricing {
  addnewdomain?: { [duration: string]: number };
  renewdomain?: { [duration: string]: number };
  restoredomain?: { [duration: string]: number };
  addtransferdomain?: { [duration: string]: number };
}

// ============================================================================
// Billing Types
// ============================================================================

export interface ResellerBalance {
  sellingcurrencybalance: number;
  accountingcurrencybalance: number;
  sellingcurrency: string;
  accountingcurrency: string;
}

export interface CustomerBalance {
  sellingcurrencybalance: number;
  sellingcurrency: string;
}

export interface Transaction {
  transactionid: number;
  transactiontype: string;
  description: string;
  amount: number;
  balance: number;
  transactiondate: string;
  orderid?: number;
  customerid?: number;
}

export interface TransactionSearchOptions {
  noOfRecords?: number;
  pageNo?: number;
  customerId?: number;
  transactionType?: 'Payment' | 'Receipt' | 'Refund';
  transactionDate?: string;
  transactionDateStart?: string;
  transactionDateEnd?: string;
}

// ============================================================================
// Order Management Types
// ============================================================================

export interface OrderSearchOptions {
  noOfRecords?: number;
  pageNo?: number;
  customerId?: number;
  productKey?: string;
  status?: OrderStatus;
  creationDateStart?: string;
  creationDateEnd?: string;
  expiryDateStart?: string;
  expiryDateEnd?: string;
}

export interface OrderAction {
  actionid: number;
  actiontype: string;
  actiontypedesc: string;
  actionstatus: string;
  actionstatusdesc: string;
  eaqid?: number;
}

// ============================================================================
// Product Keys Reference
// ============================================================================

export const PRODUCT_KEYS = {
  // Domain Extensions
  DOMAIN_COM: 'domcno',
  DOMAIN_NET: 'domnet',
  DOMAIN_ORG: 'domorg',
  DOMAIN_INFO: 'dominfo',
  DOMAIN_BIZ: 'dombiz',
  DOMAIN_CO: 'domco',
  DOMAIN_IO: 'domio',
  DOMAIN_AI: 'domai',
  DOMAIN_XYZ: 'domxyz',
  DOMAIN_ONLINE: 'domonline',
  DOMAIN_SITE: 'domsite',
  DOMAIN_STORE: 'domstore',
  DOMAIN_TECH: 'domtech',
  DOMAIN_APP: 'domapp',
  DOMAIN_DEV: 'domdev',

  // Email Products
  BUSINESS_EMAIL_US: 'eeliteus',
  ENTERPRISE_EMAIL_US: 'enterpriseemailus',
  ENTERPRISE_EMAIL_IN: 'enterpriseemailin',
  TITAN_EMAIL_INDIA: 'titanmailindia',
  TITAN_EMAIL: 'titanmail',

  // Hosting Products
  SINGLE_DOMAIN_HOSTING_LINUX: 'singledomainhostinglinux',
  SINGLE_DOMAIN_HOSTING_WINDOWS: 'singledomainhostingwindows',
  MULTI_DOMAIN_HOSTING_LINUX: 'multidomainhostinglinux',
  MULTI_DOMAIN_HOSTING_WINDOWS: 'multidomainhostingwindows',
  RESELLER_HOSTING_LINUX: 'resellerlinuxhosting',
  RESELLER_HOSTING_WINDOWS: 'resellerwindowshosting',
  VPS_LINUX: 'vpslinuxkvm',
  DEDICATED_SERVER_LINUX: 'dedicatedserverlinux',
  DEDICATED_SERVER_WINDOWS: 'dedicatedserverwindows',

  // SSL Certificates
  SSL_RAPIDSSL: 'sslrapidssl',
  SSL_GEOTRUST: 'sslgeotrust',
  SSL_COMODO: 'sslcomodo',
  SSL_THAWTE: 'sslthawte',
  SSL_SYMANTEC: 'sslsymantec',

  // Other Products
  PREMIUM_DNS: 'premiumdns',
  WEBSITE_BUILDER: 'websitebuilder',
  SITELOCK: 'sitelock',
  CODEGUARD: 'codeguard',
  GOOGLE_WORKSPACE: 'gappsgstandard',
} as const;

export type ProductKey = typeof PRODUCT_KEYS[keyof typeof PRODUCT_KEYS];

// ============================================================================
// Error Types
// ============================================================================

export interface ResellerClubError {
  status: 'ERROR';
  message: string;
  error?: string;
}

export type ResellerClubErrorCode =
  | 'InvalidParameter'
  | 'InvalidCredentials'
  | 'InsufficientFunds'
  | 'OrderNotFound'
  | 'CustomerNotFound'
  | 'ContactNotFound'
  | 'DomainNotAvailable'
  | 'OperationNotAllowed'
  | 'RateLimitExceeded'
  | 'InternalError';








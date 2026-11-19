import { Actor, Agreement, Sale } from '../products/product.models';

// Types for the customers API (backend/src/services/customerService.js).

export type DocumentKind = 'CNIC_FRONT' | 'CNIC_BACK' | 'OTHER';
export const DOCUMENT_KINDS: DocumentKind[] = ['CNIC_FRONT', 'CNIC_BACK', 'OTHER'];

export interface CustomerDocument {
  _id: string;
  kind: DocumentKind;
  contentType: string;
  size: number;
  uploadedBy: Actor;
  createdAt: string;
}

export interface Customer {
  _id: string;
  customerCode: string;
  name: string;
  phone: string;
  /** 13 digits without dashes, or '' when unknown. */
  cnic: string;
  /** "12345-1234567-1" or ''. */
  cnicFormatted: string;
  address: string;
  notes: string;
  documents: CustomerDocument[];
  createdBy: Actor;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInput { name: string; phone: string; cnic?: string; address?: string; notes?: string; }

export interface CustomerStats {
  salesCount: number; totalCents: number; activeAgreements: number; outstandingCents: number; overdueAgreements: number; overdueCents: number;
}

export interface CustomerDetails { customer: Customer; sales: Sale[]; agreements: Agreement[]; stats: CustomerStats; }

/** Pakistani CNIC: 13 digits, shown as 12345-1234567-1. */
export const cnicDigits = (value: string) => value.replace(/\D/g, '');
export const isCnic = (value: string) => value.trim() === '' || cnicDigits(value).length === 13;
export const formatCnic = (digits: string) => digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : digits;

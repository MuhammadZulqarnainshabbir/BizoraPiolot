import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { API_BASE } from '../../core/api';
import { ListQuery, Page, PageMeta } from '../../core/shop-data.service';
import { Customer, CustomerDetails, CustomerDocument, CustomerInput, DocumentKind } from './customer.models';

/** Customer records and their ID pictures. Shared by both portals (the interceptor sends the right token). */
@Injectable({ providedIn: 'root' })
export class CustomersApiService {
  private http = inject(HttpClient);
  private api = `${API_BASE}/customers`;

  list(query: Partial<ListQuery>): Observable<Page<Customer>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params = params.set(key, String(value));
    return this.http.get<PageMeta & { items: Customer[] }>(this.api, { params }).pipe(map(({ items, ...meta }) => ({ records: items, ...meta })));
  }

  /** Quick lookup for the sale forms: the first few matches for a name, phone or CNIC. */
  search(term: string, limit = 8): Observable<Customer[]> {
    return this.list({ page: 1, limit, search: term, sort: 'name', order: 'asc' }).pipe(map(p => p.records));
  }

  get(id: string) { return this.http.get<CustomerDetails>(`${this.api}/${encodeURIComponent(id)}`); }
  create(data: CustomerInput) { return this.http.post<{ customer: Customer }>(this.api, data); }
  update(id: string, data: Partial<CustomerInput> & { reason?: string }) { return this.http.patch<{ customer: Customer }>(`${this.api}/${encodeURIComponent(id)}`, data); }
  delete(id: string, reason: string) { return this.http.delete<void>(`${this.api}/${encodeURIComponent(id)}`, { body: { reason } }); }

  /** `image` is a data URL (data:image/jpeg;base64,…). */
  addDocument(id: string, kind: DocumentKind, image: string) {
    return this.http.post<{ document: CustomerDocument }>(`${this.api}/${encodeURIComponent(id)}/documents`, { kind, image });
  }
  document(id: string, docId: string) {
    return this.http.get<{ document: CustomerDocument & { dataUrl: string } }>(`${this.api}/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`);
  }
  deleteDocument(id: string, docId: string) {
    return this.http.delete<void>(`${this.api}/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`);
  }
}

/**
 * Reads an image file chosen by the user and returns it as a JPEG data URL, scaled down so the
 * longest side is at most `maxSide` pixels (ID card photos from phones are often 4000px wide).
 */
export function imageFileToDataUrl(file: File, maxSide = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Choose an image (JPEG, PNG or WebP)')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const context = canvas.getContext('2d');
      if (!context) { reject(new Error('Unable to read the image')); return; }
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unable to read the image')); };
    img.src = url;
  });
}
